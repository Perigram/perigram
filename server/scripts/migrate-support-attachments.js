// One-shot stored-shape migration: every supportMessages document's
// singular `attachment` object becomes the `attachments` array contract
// (support README, Message Attachments), stamped with
// `bucket: 'uploads'` so legacy voice-message and call-recording blobs
// keep resolving in their old GridFS bucket after new chat uploads moved
// to the `files` bucket. Idempotent: documents already carrying
// `attachments` are untouched, and re-running after --apply scans zero
// candidates.
//
//   node server/scripts/migrate-support-attachments.js          # dry-run counts
//   node server/scripts/migrate-support-attachments.js --apply  # persist
import { connectDB } from '../db/mongo.js';

export async function migrateSupportAttachments(db, { apply = process.argv.includes('--apply') } = {}) {
  const coll = db.collection('supportMessages');
  const match = { attachment: { $exists: true }, attachments: { $exists: false } };
  const candidates = await coll.countDocuments(match);
  const summary = { candidates, migrated: 0 };
  if (!apply || !candidates) return summary;
  // The descriptor keeps exactly the keys the legacy document carried
  // (null-valued entries are dropped) plus the legacy bucket marker.
  const result = await coll.updateMany(match, [
    {
      $set: {
        attachments: [{
          $arrayToObject: {
            $filter: {
              input: { $objectToArray: { $mergeObjects: [{ bucket: 'uploads' }, '$attachment'] } },
              cond: { $ne: ['$$this.v', null] }
            }
          }
        }]
      }
    },
    { $unset: 'attachment' }
  ]);
  summary.migrated = result.modifiedCount || 0;
  return summary;
}

async function main() {
  const db = await connectDB();
  const summary = await migrateSupportAttachments(db);
  console.log(`migrate-support-attachments: ${summary.migrated}/${summary.candidates} message(s) migrated${process.argv.includes('--apply') ? '' : ' (dry run)'}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
