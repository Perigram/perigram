// One-shot geometry-revision backfill for cassette designs: the facade
// sheet-design construction pins the source design revisions it places.
// Designs created before geometry revisions were minted have no
// entity_revisions row, so the construction refuses them.
//
//   node server/scripts/backfill-cassette-design-revisions.js --org org-6af9e015
//   node server/scripts/backfill-cassette-design-revisions.js --org org-6af9e015 --apply
//
// Dry-run by default.
import { createHash } from 'node:crypto';
import { connectDB } from '../db/mongo.js';
import { toFlexibleId } from '../utils/objectid.js';

const APPLY = process.argv.includes('--apply');
const args = process.argv.slice(2);
const orgIndex = args.findIndex(value => value === '--org' || value.startsWith('--org='));
const ORG = orgIndex < 0
  ? ''
  : (args[orgIndex] === '--org' ? args[orgIndex + 1] : args[orgIndex].slice(6)) || '';

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  return Object.keys(value).sort().reduce((result, key) => {
    if (value[key] !== undefined) result[key] = sortValue(value[key]);
    return result;
  }, {});
}

function contentHash(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(sortValue(value))).digest('hex')}`;
}

const db = await connectDB();
const designs = await db.collection('files')
  .find({ type: 'cassette-design', ...(ORG ? { organizationId: ORG } : {}) })
  .toArray();
const revisions = db.collection('entity_revisions');
const summary = { mode: APPLY ? 'apply' : 'dry-run', designs: designs.length, created: 0, skipped: 0, missing: 0 };

for (const design of designs) {
  const geometry = design.fields?.geometry;
  if (!geometry) {
    summary.missing += 1;
    continue;
  }
  const sourceId = String(design._id);
  const latest = await revisions
    .find({ 'data.source.type': 'cassette-design', 'data.source.id': sourceId, 'data.scope': 'geometry' })
    .sort({ 'data.number': -1 })
    .limit(1)
    .next();
  const hash = contentHash({ geometry });
  if (latest?.data?.contentHash === hash) {
    summary.skipped += 1;
    continue;
  }
  const number = Number(latest?.data?.number || 0) + 1;
  const id = `revision:cassette-design:${sourceId}:geometry:${number}`;
  const doc = {
    _id: id,
    identity: {
      uid: id,
      name: `cassette-design geometry v${number}`,
      slug: '',
      serial: '',
      reference: ''
    },
    lineage: {
      ...(design.lineage || {}),
      cassetteDesignId: sourceId,
      ...(design.organizationId ? { organizationId: toFlexibleId(design.organizationId) } : {})
    },
    relations: {},
    provenance: {},
    origin: null,
    status: null,
    attachments: {},
    data: {
      source: { type: 'cassette-design', id: sourceId },
      scope: 'geometry',
      number,
      contentHash: hash,
      createdAt: new Date().toISOString(),
      snapshot: {
        name: design.name ?? null,
        fields: design.fields || {},
        state: design.state ?? null
      },
      sourceStatus: design.state ?? null,
      reason: 'backfill'
    }
  };
  if (APPLY) {
    try {
      await revisions.insertOne(doc);
      summary.created += 1;
    } catch (error) {
      if (error?.code !== 11000) throw error;
      summary.skipped += 1;
    }
  } else {
    summary.created += 1;
  }
}

console.log(JSON.stringify(summary, null, 2));
process.exit(0);
