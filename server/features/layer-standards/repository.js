/**
 * Layer Standards Repository
 * 
 * Database operations for layer_standards collection.
 */

import { connectDB } from '~~/server/db/mongo';
import { ObjectId } from 'mongodb';

const COLLECTION = 'layer_standards';

/**
 * Find all active layer standards
 */
export async function findAllActive() {
  const db = await connectDB();
  return await db.collection(COLLECTION)
    .find({ isActive: true })
    .sort({ code: 1 })
    .toArray();
}

/**
 * Find by code
 */
export async function findByCode(code) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ code, isActive: true });
}

/**
 * Find by category
 */
export async function findByCategory(category) {
  const db = await connectDB();
  return await db.collection(COLLECTION)
    .find({ category, isActive: true })
    .sort({ code: 1 })
    .toArray();
}

/**
 * Find by ID
 */
export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
}

/**
 * Create layer standard (system only)
 */
export async function create(data) {
  const db = await connectDB();
  const doc = {
    ...data,
    isActive: true,
    createdAt: new Date()
  };
  
  const result = await db.collection(COLLECTION).insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

/**
 * Bulk create layer standards (for seeding)
 */
export async function bulkCreate(dataArray) {
  const db = await connectDB();
  const docs = dataArray.map(data => ({
    ...data,
    isActive: true,
    createdAt: new Date()
  }));
  
  const result = await db.collection(COLLECTION).insertMany(docs);
  return result.insertedIds;
}

/**
 * Soft delete (set isActive = false)
 */
export async function softDelete(id) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).updateOne(
    { _id: new ObjectId(id) },
    { $set: { isActive: false } }
  );
  
  return result.modifiedCount > 0;
}

/**
 * Count total layer standards
 */
export async function count(query = {}) {
  const db = await connectDB();
  return await db.collection(COLLECTION).countDocuments({ ...query, isActive: true });
}
