import { connectDB } from '../db/mongo.js';

const PUBLIC_MARKER = {
  'lineage.scope': 'system',
  'lineage.public': true,
  'data.visibility.public': true
};

async function markMany(db, collection, filter) {
  const result = await db.collection(collection).updateMany(filter, { $set: PUBLIC_MARKER });
  return { collection, matched: result.matchedCount, modified: result.modifiedCount };
}

async function main() {
  const db = await connectDB();
  const results = [];
  results.push(await markMany(db, 'materials', {}));
  results.push(await markMany(db, 'layer_standards', {
    $or: [
      { 'lineage.organization': { $exists: false } },
      { 'lineage.organization.entityId': null }
    ]
  }));
  results.push(await markMany(db, 'pen_templates', { 'lineage.user': { $exists: false } }));
  results.push(await markMany(db, 'tool_profiles', { 'lineage.user': { $exists: false } }));

  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
