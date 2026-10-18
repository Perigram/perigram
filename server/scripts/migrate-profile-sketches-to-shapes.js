// One-shot migration (SPEC §Owner decision 2026-10-18, profile shape
// model): stored profile sketches cross from the legacy chain model to
// the shape model — profile library records' `fields.sketch`, cassette
// payload documents' tree workpiece snapshots and definition sketches.
// Legacy chain sketches become chain shapes, holes become subtract
// circles, a closed sketch's basis anchor becomes the axis (the chain
// translates so the anchor vertex sits on X=0), and stale cached
// sections drop (the renderer re-derives from the sketch on read).
// Idempotent: shape-model sketches skip.
//
//   node server/scripts/migrate-profile-sketches-to-shapes.js          # dry-run counts
//   node server/scripts/migrate-profile-sketches-to-shapes.js --apply
import { GridFSBucket } from 'mongodb';
import { connectDB } from '../db/mongo.js';
import { upgradeLegacyOccsProfileSketch } from '../../workers/facade/occs/profiles.js';

const APPLY = process.argv.includes('--apply');

const upgradedSketch = (sketch) => {
  if (!sketch || typeof sketch !== 'object') return null;
  if (Array.isArray(sketch.shapes)) return null;
  const upgraded = upgradeLegacyOccsProfileSketch(sketch);
  return upgraded && upgraded.shapes.length ? upgraded : null;
};

const db = await connectDB();
const bucket = new GridFSBucket(db._db || db, { bucketName: 'files' });

let profilesRead = 0;
let profilesMigrated = 0;

const items = db.collection('items');
const profileRecords = await items.find({ type: 'profile' }).toArray();
for (const record of profileRecords) {
  profilesRead += 1;
  const upgraded = upgradedSketch(record.fields?.sketch);
  if (!upgraded) continue;
  profilesMigrated += 1;
  if (APPLY) {
    await items.updateOne(
      { _id: record._id },
      { $set: { 'fields.sketch': upgraded, updatedAt: new Date() } }
    );
  }
}

let cassettesRead = 0;
let cassettesMigrated = 0;
let payloadErrors = 0;

const files = db.collection('files');
const cassettes = await files.find({ type: 'cassette' }).toArray();
for (const record of cassettes) {
  cassettesRead += 1;
  const fileId = record.content?.fileId;
  if (!fileId) continue;
  let document = null;
  try {
    const chunks = [];
    const stream = bucket.openDownloadStream(fileId);
    for await (const chunk of stream) chunks.push(chunk);
    document = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    payloadErrors += 1;
    continue;
  }

  let changed = false;
  const tree = document?.extensions?.perigram?.graphTree;
  for (const workpiece of tree?.workpieces || []) {
    const upgraded = upgradedSketch(workpiece.profileSnapshot?.sketch);
    if (upgraded) {
      workpiece.profileSnapshot.sketch = upgraded;
      workpiece.profileSnapshot.section = null;
      workpiece.profileSnapshot.occsProfile = null;
      changed = true;
    }
  }
  for (const definition of document?.definitions?.workpieces || []) {
    const upgraded = upgradedSketch(definition?.extensions?.perigram?.sketch);
    if (upgraded) {
      definition.extensions.perigram.sketch = upgraded;
      if (definition.profile) definition.profile.section = null;
      changed = true;
    }
  }

  if (!changed) continue;
  cassettesMigrated += 1;
  if (APPLY) {
    const buffer = Buffer.from(JSON.stringify(document), 'utf8');
    const uploadStream = bucket.openUploadStream(`cassette-${record._id}.occs`, {
      contentType: 'application/perigram+occs',
      metadata: { type: 'cassette', migrated: 'profile-shape-model' }
    });
    uploadStream.end(buffer);
    const uploaded = await new Promise((resolve, reject) => {
      uploadStream.on('finish', () => resolve(uploadStream.id));
      uploadStream.on('error', reject);
    });
    await files.updateOne(
      { _id: record._id },
      { $set: { 'content.fileId': uploaded, 'content.size': buffer.length, updatedAt: new Date() } }
    );
  }
}

console.log(`profiles: ${profilesMigrated}/${profilesRead} migrated${APPLY ? '' : ' (dry run)'}`);
console.log(`cassettes: ${cassettesMigrated}/${cassettesRead} migrated${APPLY ? '' : ' (dry run)'}`);
if (payloadErrors) console.log(`cassette payloads unreadable: ${payloadErrors}`);
if (!APPLY) console.log('re-run with --apply to persist');
process.exit(0);
