import { connectDB } from '../db/mongo.js';

/**
 * One-way migration: sheet-design records onto the generic instance
 * machinery (SPEC §13). Block-shaped documents in `sheet_designs` become
 * §3 file-class documents in `files` (flat fields, states.main, lineage),
 * then leave the legacy collection. Specs/summary blocks are dropped —
 * they are re-derived by the layout update. Idempotent: a §3 document
 * with the same id already present is skipped.
 *
 * Usage: node server/scripts/migrate-sheet-designs-to-instances.js [--dry-run]
 */

const dryRun = process.argv.includes('--dry-run');
const db = await connectDB();

const legacy = await db.collection('sheet_designs').find({}).toArray();
let migrated = 0;
let skipped = 0;
for (const doc of legacy) {
  const existing = await db.collection('files').findOne({ _id: doc._id, type: 'sheet-design' });
  if (existing) {
    skipped += 1;
    continue;
  }
  const instance = {
    _id: doc._id,
    type: 'sheet-design',
    typeVersion: 1,
    name: doc.identity?.name || null,
    fields: {
      title: doc.identity?.name || null,
      geometry: doc.data?.geometry || null,
      parts: null
    },
    states: { main: doc.status?.state || 'DRAFT' },
    lineage: doc.lineage || {},
    relations: {},
    createdAt: doc.origin?.createdAt || new Date()
  };
  if (!dryRun) {
    await db.collection('files').insertOne(instance);
    await db.collection('sheet_designs').deleteOne({ _id: doc._id });
  }
  migrated += 1;
}
console.log(`${dryRun ? '[dry-run] ' : ''}sheet-designs → instances: ${migrated} migrated, ${skipped} skipped, ${legacy.length} total`);
process.exit(0);
