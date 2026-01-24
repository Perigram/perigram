/**
 * Status Service - CENTRALIZED STATUS LOGIC
 */

import { connectDB } from '../../db/mongo.js';
import { ObjectId } from 'mongodb';
import { isValidStatus, getValidStatuses, getDefaultStatus } from './types.js';
import { createError } from 'h3';
import * as repository from './repository.js';

/**
 * Add a new status entry in the central collection.
 * In the Lean Model, we NO LONGER update the source entity collection.
 */
export async function addStatus(collection, entityId, status, userId, note = '', metadata = {}) {
  const entityType = collection.replace(/s$/, ''); // simple plural to singular
  
  if (!isValidStatus(entityType, status)) {
    throw createError({
      statusCode: 400,
      message: `Invalid status "${status}" for ${entityType}. Valid: ${getValidStatuses(entityType).join(', ')}`
    });
  }
  
  // Create entry in the central statuses collection
  const statusEntry = await repository.create({
    entityId: new ObjectId(entityId),
    entityType,
    status,
    userId,
    note,
    metadata,
    timestamp: new Date()
  });
  
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
 * Get the latest status record for an entity
 */
export async function findLatest(collection, entityId) {
  const entityType = collection.replace(/s$/, '');
  return await repository.findLatestByEntity(entityId, entityType);
}

/**
 * Attach latest status to a single entity
 */
export async function attachStatus(entity, collection) {
  if (!entity) return null;
  const latest = await findLatest(collection, entity._id);
  return {
    ...entity,
    status: latest ? latest.status : 'unknown'
  };
}

/**
 * Attach latest statuses to an array of entities efficiently
 */
export async function attachStatuses(entities, collection) {
  if (!entities || entities.length === 0) return [];
  
  const entityType = collection.replace(/s$/, '');
  const entityIds = entities.map(e => new ObjectId(e._id));
  const db = await connectDB();
  
  const latestStatuses = await db.collection('statuses').aggregate([
    { $match: { entityId: { $in: entityIds }, entityType } },
    { $sort: { timestamp: -1 } },
    { $group: { _id: '$entityId', latest: { $first: '$$ROOT' } } }
  ]).toArray();
  
  const statusMap = latestStatuses.reduce((acc, curr) => {
    acc[curr._id.toString()] = curr.latest.status;
    return acc;
  }, {});
  
  return entities.map(e => ({
    ...e,
    status: statusMap[e._id.toString()] || 'unknown'
  }));
}

/**
 * Get status history for an entity from the central collection
 */
export async function getStatusHistory(collection, entityId) {
  const entityType = collection.replace(/s$/, '');
  const history = await repository.findByEntity(entityId, entityType);
  const latest = history.length > 0 ? history[0] : null;
  
  return {
    currentStatus: latest ? latest.status : 'unknown',
    history: history
  };
}