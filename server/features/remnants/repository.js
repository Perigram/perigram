import { connectDB } from '~/server/db/mongo';
import { ObjectId } from 'mongodb';

const COLLECTION = 'remnants';

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

export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
}

export async function find(filter = {}) {
  const db = await connectDB();
  return await db.collection(COLLECTION).find(filter).sort({ createdAt: -1 }).toArray();
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

export async function getNextRemnantNumber() {
  const db = await connectDB();
  const count = await db.collection(COLLECTION).countDocuments();
  return `REM-${(count + 1).toString().padStart(6, '0')}`;
}

export async function findReusable(filter = {}) {
  // Assuming 'specs.area' is the criteria, but let's keep it generic
  // The service should pass the correct filter
  const db = await connectDB();
  return await db.collection(COLLECTION).find(filter).toArray();
}
