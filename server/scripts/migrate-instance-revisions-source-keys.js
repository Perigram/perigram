import { connectDB } from '../db/mongo.js';

// Rewrites stored entity revisions from the legacy `data.typeId`/
// `data.instanceId` source keys onto `data.source.{type,id}` (the single
// read shape the repository serves). Dry-run by default; `--apply`
// persists. Idempotent: migrated documents no longer match the legacy
// predicate.
async function main() {
  const apply = process.argv.includes('--apply');
  const db = await connectDB();
  const collection = db.collection('entity_revisions');
  const legacyDocs = await collection.find({ 'data.typeId': { $exists: true } }).toArray();

  let migrated = 0;
  let skipped = 0;
  for (const doc of legacyDocs) {
    const typeId = doc.data?.typeId;
    const instanceId = doc.data?.instanceId;
    if (!typeId || instanceId === undefined) {
      console.warn(`Skipping ${doc._id}: incomplete legacy source keys`);
      skipped += 1;
      continue;
    }
    if (apply) {
      await collection.updateOne(
        { _id: doc._id },
        {
          $set: { 'data.source': { type: typeId, id: String(instanceId) } },
          $unset: { 'data.typeId': '', 'data.instanceId': '' }
        }
      );
    }
    migrated += 1;
  }

  console.log(
    `instance-revisions source-key migration ${apply ? 'applied' : 'dry-run'}: ` +
    `${migrated} document(s) ${apply ? 'migrated' : 'to migrate'}, ${skipped} skipped.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
