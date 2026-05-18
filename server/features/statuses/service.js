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
 * In V24, we log to status_events.
 */
export async function addStatus(collection, entityId, status, userId, note = '', metadata = {}) {
  const entityType = collection.replace(/s$/, ''); // simple plural to singular
  
  const statusEntry = await repository.create({
    targetId: new ObjectId(entityId),
    targetType: entityType,
    status: {
        state: status,
        userId,
        timestamp: new Date(),
        metadata: { ...metadata, note }
    }
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
 * Get status history for an entity from the central collection
 */
export async function getStatusHistory(collection, entityId) {
  const entityType = collection.replace(/s$/, '');
  const history = await repository.findByEntity(entityId, entityType);
  const latest = history.length > 0 ? history[0] : null;
  
  return {
    currentStatus: latest?.status?.state || 'unknown',
    history: history
  };
}

// Deprecated V23 helpers below - avoided in V24 refactors
export async function attachStatus(entity, collection) { return entity; }
export async function attachStatuses(entities, collection) { return entities; }
