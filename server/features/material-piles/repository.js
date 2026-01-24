import { connectDB } from '~/server/db/mongo';
import { ObjectId } from 'mongodb';

const COLLECTION = 'material_piles';

export async function create(data) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).insertOne(data);
  return { ...data, _id: result.insertedId };
}

export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
}

export async function find(filter = {}) {
  const db = await connectDB();
  return await db.collection(COLLECTION).find(filter).toArray();
}

export async function updateById(id, updates) {
  const db = await connectDB();
  const { _id, identity, origin, status, lineage, ...clean } = updates;
  return await db.collection(COLLECTION).updateOne({ _id: new ObjectId(id) }, { $set: clean });
}

export async function deleteById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).deleteOne({ _id: new ObjectId(id) });
}

export async function getCount() {
  const db = await connectDB();
  return await db.collection(COLLECTION).countDocuments();
}