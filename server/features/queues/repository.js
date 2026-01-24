/**
 * Queues Repository - v24 Standardized
 */

import { connectDB } from '../../db/mongo.js';
import { ObjectId } from 'mongodb';
import { toObjectId } from '../../utils/objectid.js';

const COLLECTION = 'queues';

export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: toObjectId(id) });
}

export async function find(filter = {}, options = {}) {
  const db = await connectDB();
  const { limit = 100, skip = 0, sort = { 'identity.queueNumber': -1 } } = options;
  
  return await db.collection(COLLECTION)
    .find(filter)
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .toArray();
}

export async function getNextQueueNumber(projectId) {
  const db = await connectDB();
  const lastQueue = await db.collection(COLLECTION)
    .findOne({ 'lineage.projectId': toObjectId(projectId) }, { sort: { 'identity.queueNumber': -1 } });
  return lastQueue ? (lastQueue.identity?.queueNumber || 0) + 1 : 1;
}

export async function create(data) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).insertOne(data);
  return { ...data, _id: result.insertedId };
}

export async function updateById(id, updates) {
  const db = await connectDB();
  const { _id, identity, origin, lineage, ...clean } = updates;
  
  // Maintain core blocks if they are being partially updated
  const result = await db.collection(COLLECTION).updateOne(
    { _id: toObjectId(id) },
    { $set: clean }
  );
  return result.modifiedCount > 0;
}

export async function deleteById(id) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).deleteOne({ _id: toObjectId(id) });
  return result.deletedCount > 0;
}