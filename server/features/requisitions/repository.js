import { connectDB } from '~/server/db/mongo';
import { ObjectId } from 'mongodb';

const COLLECTION = 'requisitions';

export async function create(data) {
  const db = await connectDB();
  const doc = {
    requisitionNumber: data.requisitionNumber,
    contractorId: data.contractorId ? new ObjectId(data.contractorId) : null,
    manufacturerId: data.manufacturerId ? new ObjectId(data.manufacturerId) : null,
    projectId: data.projectId ? new ObjectId(data.projectId) : null,
    queueId: data.queueId ? new ObjectId(data.queueId) : null,
    items: data.items || [],
    totalAmount: data.totalAmount || 0,
    notes: data.notes || ''
  };
  const result = await db.collection(COLLECTION).insertOne(doc);
  return { ...doc, _id: result.insertedId };
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
  const { _id, createdAt, updatedAt, status, statusHistory, userId, ...clean } = updates;
  return await db.collection(COLLECTION).updateOne({ _id: new ObjectId(id) }, { $set: clean });
}

export async function deleteById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).deleteOne({ _id: new ObjectId(id) });
}

export async function getNextRequisitionNumber() {
  const db = await connectDB();
  const count = await db.collection(COLLECTION).countDocuments();
  return `REQ-${(count + 1).toString().padStart(6, '0')}`;
}