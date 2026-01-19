import { connectDB } from '~/server/db/mongo';
import { ObjectId } from 'mongodb';

const COLLECTION = 'requisitions';

export async function create(data) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).insertOne({
    ...data,
    createdAt: new Date()
  });
  return await findById(result.insertedId);
}

export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
}

export async function findByRequisitionNumber(requisitionNumber) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ requisitionNumber });
}

export async function find(filter = {}, options = {}) {
  const db = await connectDB();
  return await db.collection(COLLECTION)
    .find(filter)
    .sort(options.sort || { createdAt: -1 })
    .limit(options.limit || 100)
    .toArray();
}

export async function updateById(id, updates) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).updateOne(
    { _id: new ObjectId(id) },
    { $set: updates }
  );
  return result.modifiedCount > 0;
}

export async function addStatusHistory(id, statusEntry) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).updateOne(
    { _id: new ObjectId(id) },
    { 
      $push: { statusHistory: statusEntry },
      $set: { status: statusEntry.status, updatedAt: new Date() }
    }
  );
  return result.modifiedCount > 0;
}

export async function deleteById(id) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
}

export async function getNextRequisitionNumber() {
  const db = await connectDB();
  const lastReq = await db.collection(COLLECTION)
    .find({})
    .sort({ createdAt: -1 })
    .limit(1)
    .toArray();
  
  if (lastReq.length === 0) {
    return 'REQ-000001';
  }
  
  const lastNumber = lastReq[0].requisitionNumber;
  const match = lastNumber.match(/REQ-(\d+)/);
  if (match) {
    const nextNum = parseInt(match[1]) + 1;
    return `REQ-${nextNum.toString().padStart(6, '0')}`;
  }
  
  return `REQ-${Date.now()}`;
}
