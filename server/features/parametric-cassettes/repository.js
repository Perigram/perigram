/**
 * Parametric Cassettes Repository
 * Handles database operations for baked parametric cassette instances
 */

import { connectDB } from '../../db/mongo.js';
import { toFlexibleId } from '../../utils/objectid.js';

const CASSETTES_COLLECTION = 'cassettes';

/**
 * Find a cassette template by ID
 * @param {string|ObjectId} id 
 * @returns {Promise<Object>}
 */
export async function findTemplateById(id) {
  const db = await connectDB();
  return await db.collection(CASSETTES_COLLECTION).findOne({ _id: toFlexibleId(id) });
}
