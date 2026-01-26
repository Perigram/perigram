import { connectDB } from '~/server/db/mongo';
import { ObjectId } from 'mongodb';

const COLLECTION = 'cassette_instances';

export async function create(data) {
  const db = await connectDB();
  const doc = {
    ...data,
    _id: data._id || new ObjectId(),
    createdAt: new Date(),
    updatedAt: new Date()
  };
  await db.collection(COLLECTION).insertOne(doc);
  return doc;
}

export async function insertMany(docs) {
  const db = await connectDB();
  const prepared = docs.map(d => ({
      ...d,
      _id: d._id || new ObjectId(),
      createdAt: new Date(),
      updatedAt: new Date()
  }));
  await db.collection(COLLECTION).insertMany(prepared);
  return prepared;
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
  const { _id, ...clean } = updates;
  await db.collection(COLLECTION).updateOne(
    { _id: new ObjectId(id) }, 
    { $set: { ...clean, updatedAt: new Date() } }
  );
  return await findById(id);
}

export async function deleteById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).deleteOne({ _id: new ObjectId(id) });
}