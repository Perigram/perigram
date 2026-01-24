import { connectDB } from '~/server/db/mongo';
import { ObjectId } from 'mongodb';

const COLLECTION = 'warehouses';

export async function create(data) {
  const db = await connectDB();
  const doc = {
    name: data.name,
    organizationId: data.organizationId ? new ObjectId(data.organizationId) : null,
    address: data.address || '',
    contactPerson: data.contactPerson || '',
    totalBatches: 0,
    totalSheets: 0,
    totalRemnants: 0
  };
  const result = await db.collection(COLLECTION).insertOne(doc);
  return await findById(result.insertedId);
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
  const { _id, createdAt, updatedAt, userId, permissions, role, success, ...clean } = updates;
  return await db.collection(COLLECTION).updateOne({ _id: new ObjectId(id) }, { $set: clean });
}

export async function incrementCounts(id, updates) {
  const db = await connectDB();
  return await db.collection(COLLECTION).updateOne(
    { _id: new ObjectId(id) },
    { $inc: updates }
  );
}

export async function deleteById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).deleteOne({ _id: new ObjectId(id) });
}