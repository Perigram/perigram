// Migrates persisted nesting provenance to the CTS shape: moves
// data.{machine,tool,material}Snapshot on nesting_runs, sheet_designs, and
// sheets into provenance.solve.effective.{machine,tool,material} and drops
// the legacy data fields. The compatibility nesting_jobs records keep their
// snapshot fields (declared compatibility surface).
//
// Usage: node scripts/migrate-nesting-provenance.js [--apply]
import { connectDB } from '../db/mongo.js';

const APPLY = process.argv.includes('--apply');

function stringId(value) {
  return value?.toString?.() || value || '';
}

function effectiveFrom(data = {}) {
  const effective = {
    machine: data.machineSnapshot || null,
    tool: data.toolSnapshot || null,
    material: data.materialSnapshot || null
  };
  if (!effective.machine && !effective.tool && !effective.material) return null;
  return effective;
}

async function migrateCollection(db, name, sourceRef) {
  const collection = db.collection(name);
  const cursor = collection.find({ $or: [
    { 'data.machineSnapshot': { $ne: null } },
    { 'data.toolSnapshot': { $ne: null } },
    { 'data.materialSnapshot': { $ne: null } }
  ] });
  let scanned = 0;
  let migrated = 0;
  for await (const document of cursor) {
    scanned += 1;
    const effective = effectiveFrom(document.data || {});
    if (!effective) continue;
    const update = {
      $set: { provenance: { ...(document.provenance || {}), solve: { source: sourceRef(document), effective } } },
      $unset: { 'data.machineSnapshot': '', 'data.toolSnapshot': '', 'data.materialSnapshot': '' }
    };
    if (APPLY) await collection.updateOne({ _id: document._id }, update);
    migrated += 1;
  }
  console.log(`${name}: ${migrated}/${scanned} documents ${APPLY ? 'migrated' : 'would migrate'}`);
}

async function main() {
  const { db } = await connectDB();
  await migrateCollection(db, 'nesting_runs', run => run.lineage?.queueId
    ? { type: 'queue', id: stringId(run.lineage.queueId) }
    : { type: 'queue', id: '' });
  await migrateCollection(db, 'sheet_designs', design => design.lineage?.runId
    ? { type: 'nesting_run', id: stringId(design.lineage.runId) }
    : { type: 'nesting_run', id: '' });
  await migrateCollection(db, 'sheets', sheet => sheet.lineage?.sheetDesignId
    ? { type: 'nesting_run', id: stringId(sheet.lineage.runId || '') }
    : { type: 'nesting_run', id: '' });
  if (!APPLY) console.log('dry run; pass --apply to write');
  process.exit(0);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
