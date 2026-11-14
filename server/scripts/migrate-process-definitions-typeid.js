// One-shot migration of persisted process definitions (and their stored
// compiled snapshots) authored before the typeId unification: legacy
// `entityType`/`childEntityType`/`ancestorEntityType`/`parentEntityType`
// keys and `entityList`/`entityDetail` templates rewrite to their
// typeId-vocabulary equivalents. The load seam applies the same rewrite
// (graph-protocol `renameLegacyTypeKeys`), so this script persists what
// hydration already normalizes — run with APPLY=1 to write.
import { connectDB } from '../db/mongo.js';
import { renameLegacyTypeKeys } from '#packages/cts';

const apply = process.env.APPLY === '1';

async function main() {
  const db = await connectDB();
  const docs = await db.collection('process_definitions').find({}).toArray();
  let updated = 0;
  for (const doc of docs) {
    const next = renameLegacyTypeKeys(doc);
    if (JSON.stringify(next) === JSON.stringify(doc)) continue;
    updated += 1;
    if (apply) {
      await db.collection('process_definitions').replaceOne({ _id: doc._id }, next);
    }
  }
  console.log(`${apply ? 'Updated' : 'Would update'} ${updated} process definition documents.`);
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
