/**
 * Status Service - CENTRALIZED STATUS LOGIC
 */

import { connectDB } from '../../db/mongo.js';
import { ObjectId } from 'mongodb';
import { isValidStatus, getValidStatuses, getDefaultStatus } from './types.js';
import { createError } from 'h3';
import * as repository from './repository.js';

/**
 * Add a new status entry and update the entity's current status
 */
export async function addStatus(collection, entityId, status, userId, note = '', metadata = {}) {
  const entityType = collection.replace(/s$/, ''); // simple plural to singular
  
  if (!isValidStatus(entityType, status)) {
    throw createError({
      statusCode: 400,
      message: `Invalid status "${status}" for ${entityType}. Valid: ${getValidStatuses(entityType).join(', ')}`
    });
  }
  
  const db = await connectDB();
  
  // 1. Create entry in the central statuses collection
  const statusEntry = await repository.create({
    entityId,
    entityType,
    status,
    userId,
    note,
    metadata,
    timestamp: new Date()
  });
  
  // 2. Update the entity itself with the current status (for performance)
  const result = await db.collection(collection).updateOne(
    { _id: new ObjectId(entityId) },
    { 
      $set: { 
        status,
        updatedAt: new Date()
      }
    }
  );
  
  if (result.matchedCount === 0) {
    throw createError({ statusCode: 404, message: `Entity not found: ${collection}/${entityId}` });
  }
  
  return statusEntry;
}

/**
 * Initialize status for a new entity
 */
export async function initializeStatus(collection, entityId, userId, note = 'Created') {
  const entityType = collection.replace(/s$/, '');
  const defaultStatus = getDefaultStatus(entityType);
  return await addStatus(collection, entityId, defaultStatus, userId, note, { initialized: true });
}

/**
 * Get status history for an entity from the central collection
 */
export async function getStatusHistory(collection, entityId) {
  const entityType = collection.replace(/s$/, '');
  const history = await repository.findByEntity(entityId, entityType);
  
  // Also get current status from entity to be sure
  const db = await connectDB();
  const entity = await db.collection(collection).findOne(
    { _id: new ObjectId(entityId) },
    { projection: { status: 1 } }
  );
  
  if (!entity) {
    throw createError({
      statusCode: 404,
      message: `Entity not found: ${collection}/${entityId}`
    });
  }
  
  return {
    currentStatus: entity.status,
    history: history
  };
}