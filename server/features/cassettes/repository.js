/**
 * Cassettes Repository
 */

import { connectDB } from '../../db/mongo.js';
import { ObjectId } from 'mongodb';
import { toObjectId } from '../../utils/objectid.js';

const COLLECTION = 'cassettes';

export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: toObjectId(id) });
}

export async function findBySlug(slug) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ slug });
}

export async function findByOwner(ownerId, options = {}) {
  const db = await connectDB();
  const { status, limit = 100, skip = 0 } = options;
  
  // Old cassettes use 'userId' field with string IDs (not ObjectIds)
  // Auth returns strings like "google:117482666136714297322"
  const query = { userId: ownerId };  // Don't convert to ObjectId
  
  // NOTE: Old schema uses 'processingStatus' not 'status'
  if (status) query.processingStatus = status;
  
  console.log('[cassettes] Query:', query);
  
  const results = await db.collection(COLLECTION)
    .find(query)
    .sort({ updatedAt: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();
  
  console.log('[cassettes] Found:', results.length, 'cassettes');
  
  return results;
}

export async function create(data) {
  const db = await connectDB();
  const doc = {
    status: 'DRAFT',
    ...data,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  const result = await db.collection(COLLECTION).insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function updateById(id, updates) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).updateOne(
    { _id: toObjectId(id) },
    { 
      $set: { 
        ...updates, 
        updatedAt: new Date() 
      } 
    }
  );
  return result.modifiedCount > 0;
}

export async function deleteById(id) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).deleteOne({ _id: toObjectId(id) });
  return result.deletedCount > 0;
}

export async function count(query = {}) {
  const db = await connectDB();
  return await db.collection(COLLECTION).countDocuments(query);
}
