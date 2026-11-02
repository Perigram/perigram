// One-shot migration (SPEC §25 process-event delivery): stored
// `process_events` records gain their explicit delivery state. Undispatched
// rows become `pending`; rows carrying a dispatch stamp become `dispatched`.
// Idempotent: rows already carrying `status` skip.
//
//   node server/scripts/migrate-process-event-status.js          # dry-run counts
//   node server/scripts/migrate-process-event-status.js --apply
import { connectDB } from '../db/mongo.js';

const APPLY = process.argv.includes('--apply');

const db = await connectDB();
const events = db.collection('process_events');

const rows = await events.find({ status: { $exists: false } }).toArray();
const pending = rows.filter(row => !row.dispatchedAt).length;
const dispatched = rows.length - pending;

for (const row of rows) {
  if (!APPLY) continue;
  await events.updateOne(
    { _id: row._id },
    {
      $set: {
        status: row.dispatchedAt ? 'dispatched' : 'pending',
        attempts: Number(row.attempts) || 0,
        lastError: row.lastError ?? null
      }
    }
  );
}

console.log(`${APPLY ? 'Migrated' : 'Would migrate'} ${rows.length} process event(s): ${pending} pending, ${dispatched} dispatched.`);
