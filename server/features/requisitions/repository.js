import { connectDB } from '~/server/db/mongo';
import { ObjectId } from 'mongodb';

const COLLECTION = 'requisitions';

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

export async function getNextRequisitionNumber() {
    const db = await connectDB();
    const count = await db.collection(COLLECTION).countDocuments();
    return (count + 1).toString().padStart(5, '0');
}

export async function updateById(id, updates) {
  const db = await connectDB();
  return await db.collection(COLLECTION).updateOne({ _id: new ObjectId(id) }, { $set: updates });
}

export async function deleteById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).deleteOne({ _id: new ObjectId(id) });
}
