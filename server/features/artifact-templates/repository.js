import { ObjectId } from 'mongodb';
import { connectDB } from '../../db/mongo.js';
import { toFlexibleId } from '../../utils/objectid.js';

const COLLECTION = 'artifact_templates';

export async function create(data) {
  const db = await connectDB();
  const doc = { ...data, _id: data._id || new ObjectId() };
  await db.collection(COLLECTION).insertOne(doc);
  return doc;
}

export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: toFlexibleId(id) });
}

export async function find(filter = {}) {
  const db = await connectDB();
  return await db.collection(COLLECTION).find(filter).sort({ 'identity.name': 1 }).toArray();
}

export async function updateById(id, patch) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).findOneAndUpdate(
    { _id: toFlexibleId(id) },
    { $set: patch },
    { returnDocument: 'after' }
  );
  return result || null;
}

export async function deleteById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).deleteOne({ _id: toFlexibleId(id) });
}
