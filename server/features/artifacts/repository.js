/**
 * Artifacts Repository
 */

import { connectDB } from '../../db/mongo.js';
import { ObjectId } from 'mongodb';

import { toObjectId } from '../../utils/objectid.js';
const COLLECTION = 'artifacts';

export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: toObjectId(id) });
}

export async function findByBatch(batchId, options = {}) {
  const db = await connectDB();
  const { type, status, limit = 100, skip = 0 } = options;
  
  const query = { batchId: toObjectId(batchId) };
  if (type) query.type = type;
  if (status) query.status = status;
  
  return await db.collection(COLLECTION)
    .find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();
}

export async function create(data) {
  const db = await connectDB();
  const doc = {
    ...data,
    status: 'GENERATING',
    createdAt: new Date()
  };
  
  const result = await db.collection(COLLECTION).insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function updateById(id, updates) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).updateOne(
    { _id: toObjectId(id) },
    { $set: updates }
  );
  return result.modifiedCount > 0;
}

export async function deleteById(id) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).deleteOne({ _id: toObjectId(id) });
  return result.deletedCount > 0;
}
