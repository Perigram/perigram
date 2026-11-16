// One-shot per-instance revision backfill (CTS SPEC §3 / graph SPEC §28.8).
// New instances start at revision 1 and every authoritative mutation advances
// the counter. Existing typed documents are assigned their baseline revision.
// Dry-run by default; --apply persists. Idempotent.
import { connectDB } from '../db/mongo.js';
import { CLASS_COLLECTIONS } from '#packages/cts';

const needsRevision = {
  $or: [
    { revision: { $exists: false } },
    { revision: { $not: { $type: 'number' } } },
    { revision: { $lte: 0 } }
  ]
};

export async function runInstanceRevisionBackfill(database, { apply = false } = {}) {
  const db = database || await connectDB();
  const summary = { mode: apply ? 'apply' : 'dry-run', scanned: 0, eligible: 0, updated: 0, skipped: 0, failures: [] };

  for (const collection of Object.values(CLASS_COLLECTIONS)) {
    const cursor = db.collection(collection).find({
      type: { $type: 'string', $ne: '' },
      ...needsRevision
    }).project({ _id: 1 });
    for await (const doc of cursor) {
      summary.scanned += 1;
      summary.eligible += 1;
      if (!apply) continue;
      try {
        const result = await db.collection(collection).updateOne(
          { _id: doc._id, type: { $type: 'string', $ne: '' }, ...needsRevision },
          { $set: { revision: 1 } }
        );
        if (result.modifiedCount === 1) summary.updated += 1;
        else summary.skipped += 1;
      } catch (error) {
        summary.failures.push(`${collection}/${doc._id}: ${error.message}`);
      }
    }
  }
  return summary;
}

const invokedDirectly = process.argv[1]?.endsWith('backfill-instance-revisions.js');
if (invokedDirectly) {
  runInstanceRevisionBackfill(null, { apply: process.argv.includes('--apply') }).then(summary => {
    console.log(JSON.stringify(summary, null, 2));
    process.exit(summary.failures.length ? 1 : 0);
  });
}
