import { connectDB } from '../../db/mongo.js';
import { toFlexibleId } from '../../utils/objectid.js';

export async function upsertEntities(collection, entities = []) {
  if (!entities.length) return [];
  const db = await connectDB();
  const operations = entities.map(entity => {
    const doc = normalizeDocument(entity);
    return {
      replaceOne: {
        filter: { _id: doc._id },
        replacement: doc,
        upsert: true
      }
    };
  });
  await db.collection(collection).bulkWrite(operations, { ordered: true });
  return await db.collection(collection).find({ _id: { $in: operations.map(operation => operation.replaceOne.replacement._id) } }).toArray();
}

function normalizeDocument(entity) {
  const doc = JSON.parse(JSON.stringify(entity));
  if (doc._id) doc._id = toFlexibleId(doc._id);
  return doc;
}
