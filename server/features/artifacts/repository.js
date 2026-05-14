import { connectDB } from '../../db/mongo.js';
import { toFlexibleId } from '../../utils/objectid.js';

const COLLECTION = 'artifacts';

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

export async function find(filter = {}) {
  const db = await connectDB();
  return await db.collection(COLLECTION).find(filter).toArray();
}

export async function findOne(filter = {}) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne(filter);
}

export async function updateById(id, patch) {
  const db = await connectDB();
  await db.collection(COLLECTION).updateOne(
    { _id: toFlexibleId(id) },
    { $set: patch }
  );
  return await findById(id);
}

export async function deleteById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).deleteOne({ _id: toFlexibleId(id) });
}
