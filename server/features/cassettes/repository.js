import { connectDB } from '../../db/mongo.js';
import { toFlexibleId } from '../../utils/objectid.js';

const COLLECTION = 'cassettes';

export async function create(data) {
  const db = await connectDB();
  const doc = {
    ...data,
    _id: data.identity?.uid || data._id
  };
  await db.collection(COLLECTION).insertOne(doc);
  return doc;
}

export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: toFlexibleId(id) });
}

export async function find(filter = {}, options = {}) {
  const db = await connectDB();
  return await db.collection(COLLECTION)
    .find(filter)
    .limit(options.limit || 100)
    .skip(options.skip || 0)
    .toArray();
}

export async function updateById(id, updates) {
  const db = await connectDB();
  const { _id, ...clean } = updates;
  await db.collection(COLLECTION).updateOne(
    { _id: toFlexibleId(id) }, 
    { $set: clean }
  );
  return await findById(id);
}

export async function deleteById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).deleteOne({ _id: toFlexibleId(id) });
}
