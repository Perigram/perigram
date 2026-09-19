// One-way stored-shape migration (SPEC §3 tenancy): every per-class
// instance document gains the top-level `organizationId` slot copied from
// the legacy `lineage.organizationId` projection, and the lineage key is
// removed — lineage holds pure tree edges after this runs. Idempotent:
// documents without the legacy key are untouched, and re-running after
// --apply scans zero candidates.
//
//   node server/scripts/migrate-instance-tenancy.js          # dry-run counts
//   node server/scripts/migrate-instance-tenancy.js --apply  # persist
import { connectDB } from '../db/mongo.js';
import { CLASS_COLLECTIONS } from '../../packages/cts/src/index.js';

export async function migrateInstanceTenancy(db, { apply = process.argv.includes('--apply') } = {}) {
  const summary = {};
  for (const collection of Object.values(CLASS_COLLECTIONS)) {
    const coll = db.collection(collection);
    const candidates = await coll.countDocuments({
      'lineage.organizationId': { $exists: true },
      organizationId: { $exists: false }
    });
    summary[collection] = { candidates, migrated: 0 };
    if (!apply || !candidates) continue;
    const result = await coll.updateMany(
      { 'lineage.organizationId': { $exists: true }, organizationId: { $exists: false } },
      [{ $set: { organizationId: '$lineage.organizationId' } }, { $unset: 'lineage.organizationId' }]
    );
    summary[collection].migrated = result.modifiedCount;
  }
  return summary;
}

async function main() {
  const db = await connectDB();
  const apply = process.argv.includes('--apply');
  const summary = await migrateInstanceTenancy(db, { apply });
  console.log(`${apply ? '[apply]' : '[dry-run]'} ${JSON.stringify(summary)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
