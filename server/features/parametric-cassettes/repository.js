/**
 * Parametric Cassettes Repository
 * Handles database operations for baked parametric cassette instances
 */

import { connectDB } from '../../db/mongo.js';
import { ObjectId } from 'mongodb';
import { toFlexibleId } from '../../utils/objectid.js';

const CASSETTES_COLLECTION = 'cassettes';
const BAKED_COLLECTION = 'cassette_designs';

/**
 * Find a cassette template by ID
 * @param {string|ObjectId} id 
 * @returns {Promise<Object>}
 */
export async function findTemplateById(id) {
  const db = await connectDB();
  return await db.collection(CASSETTES_COLLECTION).findOne({ _id: toFlexibleId(id) });
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
    _id: data._id || new ObjectId()
  };
  
  await db.collection(BAKED_COLLECTION).insertOne(doc);
  return doc;
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
    'lineage.cassette.entityId': String(originalId),
    'data.dimensions': dimensions
  });
}
