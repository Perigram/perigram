import { connectDB } from '~/server/db/mongo';
import { ObjectId } from 'mongodb';

const COLLECTION = 'material_batches';

export async function create(data) {
  const db = await connectDB();
  const doc = {
    batchNumber: data.batchNumber,
    receiptId: data.receiptId || '',
    supplierId: data.supplierId ? new ObjectId(data.supplierId) : null,
    warehouseId: data.warehouseId ? new ObjectId(data.warehouseId) : null,
    requisitionId: data.requisitionId ? new ObjectId(data.requisitionId) : null,
    organizationId: data.organizationId ? new ObjectId(data.organizationId) : null,
    piles: data.piles || [],
    notes: data.notes || ''
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
  const { _id, createdAt, updatedAt, status, statusHistory, userId, organizationData, role, success, ...clean } = updates;
  return await db.collection(COLLECTION).updateOne({ _id: new ObjectId(id) }, { $set: clean });
}

export async function deleteById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).deleteOne({ _id: new ObjectId(id) });
}

export async function getNextBatchNumber() {
  const db = await connectDB();
  const count = await db.collection(COLLECTION).countDocuments();
  return `BATCH-${(count + 1).toString().padStart(6, '0')}`;
}