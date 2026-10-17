import { GridFSBucket, ObjectId } from 'mongodb';
import { connectDB } from '../db/mongo.js';
import { evaluateOccsCassetteTemplate } from '../../workers/facade/occs/evaluate.js';

// Backfill: bake `fields.polygonParts` for existing cassette records from
// their stored OCCS payload documents — the same evaluation the designer's
// save path runs (occs/evaluate is the single projection home), so load
// pickers, cards, and compact snapshots render without a manual re-save of
// every record. Records already carrying baked parts are skipped;
// payload-less or unresolvable records are reported, never failed.
//
// Run inside the app container against the dev stack:
//   docker compose -f docker-compose.dev.yml exec app \
//     node server/scripts/bake-cassette-previews.js
//
// Idempotent: re-running touches only records without baked parts.

const db = await connectDB();
const bucket = new GridFSBucket(db, { bucketName: 'files' });

async function payloadDocument(record) {
  const fileId = record?.payload?.fileId || record?.payload?.id;
  if (!fileId) return null;
  try {
    const buffer = await new Promise((resolve, reject) => {
      const parts = [];
      const stream = bucket.openDownloadStream(new ObjectId(String(fileId)));
      stream.on('data', chunk => parts.push(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(parts)));
    });
    return JSON.parse(buffer.toString('utf8'));
  } catch {
    return null;
  }
}

const records = await db.collection('files')
  .find({ type: 'cassette' }, { projection: { name: 1, payload: 1, 'fields.polygonParts': 1 } })
  .toArray();

let baked = 0;
let skipped = 0;
let failed = 0;

for (const record of records) {
  if (Array.isArray(record?.fields?.polygonParts) && record.fields.polygonParts.length) {
    skipped += 1;
    continue;
  }
  const definition = await payloadDocument(record);
  if (!definition?.extensions?.perigram?.graphTree) {
    failed += 1;
    console.log(`no readable OCCS payload: ${record.name || record._id}`);
    continue;
  }
  try {
    const evaluation = await evaluateOccsCassetteTemplate(definition, {}, {
      templateId: String(record._id),
      templateName: record.name || 'Cassette'
    });
    const polygonParts = (evaluation?.polygons || []).map(part => ({ coordinates: part.coordinates }));
    if (!polygonParts.length) throw new Error('evaluation produced no polygons');
    await db.collection('files').updateOne(
      { _id: record._id },
      { $set: { 'fields.polygonParts': polygonParts, updatedAt: new Date().toISOString() } }
    );
    baked += 1;
  } catch (error) {
    failed += 1;
    console.log(`evaluation failed: ${record.name || record._id} — ${error?.message || error}`);
  }
}

console.log(`cassettes: ${records.length} — baked: ${baked}, already baked: ${skipped}, failed: ${failed}`);
process.exit(0);
