/**
 * Parametric Cassettes Repository
 * Handles database operations for baked parametric cassette instances
 */

import { connectDB } from '../../db/mongo.js';
import { ObjectId } from 'mongodb';
import { toObjectId } from '../../utils/objectid.js';

const CASSETTES_COLLECTION = 'cassettes';
const BAKED_COLLECTION = 'baked_cassettes';

/**
 * Find a cassette template by ID
 * @param {string|ObjectId} id 
 * @returns {Promise<Object>}
 */
export async function findTemplateById(id) {
  const db = await connectDB();
  return await db.collection(CASSETTES_COLLECTION).findOne({ _id: toObjectId(id) });
}

/**
 * Create a baked cassette instance in separate collection
 * @param {Object} data 
 * @returns {Promise<Object>}
 */
export async function createBakedInstance(data) {
  const db = await connectDB();
  const doc = {
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours TTL
  };
  
  const result = await db.collection(BAKED_COLLECTION).insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

/**
 * Find an existing baked instance with same parameters to avoid re-baking
 * @param {string} originalId 
 * @param {Object} dimensions 
 * @returns {Promise<Object>}
 */
export async function findExistingBakedInstance(originalId, dimensions) {
  const db = await connectDB();
  return await db.collection(BAKED_COLLECTION).findOne({
    'metadata.originalCassetteId': toObjectId(originalId),
    'metadata.dimensions': dimensions,
    expiresAt: { $gt: new Date() }
  });
}
