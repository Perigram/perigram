// One-shot deadline-clock backfill (SPEC §3/§7). Flat §3 instance docs now
// carry `stateChangedAt` (when the current state was entered — the deadline
// clock); every state write going forward stamps it. Existing docs get the
// best evidence available: the target's latest status_events timestamp,
// else the doc's updatedAt. Dry-run by default; `--apply` persists.
// Idempotent: re-running is a no-op.
import { connectDB } from '../db/mongo.js';

const CLASS_COLLECTIONS = ['files', 'items', 'groups', 'processes'];

export async function runStateChangedAtBackfill(database, { apply = false } = {}) {
  const db = database || await connectDB();
  const summary = { mode: apply ? 'apply' : 'dry-run', stamped: 0, skipped: 0, failures: [] };

  for (const collection of CLASS_COLLECTIONS) {
    const docs = await db.collection(collection)
      .find({ state: { $type: 'string', $ne: '' }, stateChangedAt: { $exists: false } })
      .project({ _id: 1, updatedAt: 1 })
      .limit(50000)
      .toArray();
    for (const doc of docs) {
      try {
        const latestEvent = await db.collection('status_events')
          .find({ targetId: doc._id })
          .sort({ timestamp: -1 })
          .limit(1)
          .project({ timestamp: 1 })
          .next();
        const enteredAt = latestEvent?.timestamp
          ? new Date(latestEvent.timestamp).toISOString()
          : (doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null);
        if (!enteredAt) {
          summary.skipped += 1;
          continue;
        }
        if (apply) {
          await db.collection(collection).updateOne(
            { _id: doc._id, stateChangedAt: { $exists: false } },
            { $set: { stateChangedAt: enteredAt } }
          );
        }
        summary.stamped += 1;
      } catch (error) {
        summary.failures.push(`${collection}/${doc._id}: ${error.message}`);
      }
    }
  }
  return summary;
}

const invokedDirectly = process.argv[1]?.endsWith('backfill-state-changed-at.js');
if (invokedDirectly) {
  runStateChangedAtBackfill(null, { apply: process.argv.includes('--apply') }).then(summary => {
    console.log(JSON.stringify(summary, null, 2));
    process.exit(summary.failures.length ? 1 : 0);
  });
}
