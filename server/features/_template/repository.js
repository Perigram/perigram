/**
 * Repository Layer Template
 * 
 * Handles ALL database operations for this module.
 * No business logic - just CRUD operations.
 */

import { connectDB } from '../../db/mongo.js';
import { ObjectId } from 'mongodb';

const COLLECTION = 'collection_name'; // Replace with actual collection name

/**
 * Find single document by ID
 */
export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: toObjectId(id) });
}

/**
 * Find documents by query
 */
export async function findMany(query = {}, options = {}) {
  const db = await connectDB();
  const { limit = 100, skip = 0, sort = { createdAt: -1 } } = options;
  
  return await db.collection(COLLECTION)
    .find(query)
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .toArray();
}

/**
 * Create new document
 */
export async function create(data) {
  const db = await connectDB();
  const doc = {
    ...data,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  const result = await db.collection(COLLECTION).insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

/**
 * Update document by ID
 */
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

/**
 * Delete document by ID
 */
export async function deleteById(id) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).deleteOne({ _id: toObjectId(id) });
  return result.deletedCount > 0;
}

/**
 * Count documents matching query
 */
export async function count(query = {}) {
  const db = await connectDB();
  return await db.collection(COLLECTION).countDocuments(query);
}
