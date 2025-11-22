/**
 * Cassettes Repository
 */

import { connectDB } from '~~/server/db/mongo';
import { ObjectId } from 'mongodb';

const COLLECTION = 'cassette_templates';

export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
}

export async function findBySlug(slug) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ slug });
}

export async function findByOwner(ownerId, options = {}) {
  const db = await connectDB();
  const { status, limit = 100, skip = 0 } = options;
  
  const query = { ownerId: new ObjectId(ownerId) };
  if (status) query.status = status;
  
  return await db.collection(COLLECTION)
    .find(query)
    .sort({ updatedAt: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();
}

export async function create(data) {
  const db = await connectDB();
  const doc = {
    ...data,
    status: 'DRAFT',
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  const result = await db.collection(COLLECTION).insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function updateById(id, updates) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).updateOne(
    { _id: new ObjectId(id) },
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
  const result = await db.collection(COLLECTION).deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
}

export async function count(query = {}) {
  const db = await connectDB();
  return await db.collection(COLLECTION).countDocuments(query);
}
