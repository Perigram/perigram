/**
 * Status Service - CENTRALIZED STATUS LOGIC
 */

import { connectDB } from '../../db/mongo.js';
import { ObjectId } from 'mongodb';
import { isValidStatus, getValidStatuses, getDefaultStatus } from './types.js';
import { createError } from 'h3';
import * as repository from './repository.js';
import * as usersRepository from '../users/repository.js';
import { getPrimaryState, normalizeStatusState } from '~/server/core/blocks/index.js';

/**
 * Add a new status entry in the central collection.
 * In V24, we log to status_events.
 */
export async function addStatus(collection, instanceId, status, userId, note = '', metadata = {}) {
  const typeId = collection.replace(/s$/, ''); // simple plural to singular
  
  const statusEntry = await repository.create({
    targetId: new ObjectId(instanceId),
    targetType: typeId,
    status: {
        state: normalizeStatusState(status),
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
export async function initializeStatus(collection, instanceId, userId, note = 'Created') {
  const typeId = collection.replace(/s$/, '');
  const defaultStatus = getDefaultStatus(typeId);
  return await addStatus(collection, instanceId, defaultStatus, userId, note, { initialized: true });
}

/**
 * Get the latest status record for an entity
 */
export async function findLatest(collection, instanceId) {
  const typeId = collection.replace(/s$/, '');
  return await repository.findLatestByEntity(instanceId, typeId);
}

/**
 * Get status history for an entity from the central collection
 */
export async function getStateHistory(collection, instanceId) {
  const typeId = collection.replace(/s$/, '');
  const history = await getHistoryByTarget(typeId, instanceId);
  const latest = history.length > 0 ? history[0] : null;
  
  return {
    currentStatus: getPrimaryState(latest?.status, 'unknown'),
    history: history
  };
}

export async function getHistoryByTarget(typeId, instanceId) {
  const history = await repository.findByEntity(instanceId, typeId);
  return await enrichHistoryActors(history);
}

async function enrichHistoryActors(history) {
  const actorIds = [...new Set(history
    .map(event => event.status?.userId)
    .filter(userId => userId && userId !== 'SYSTEM'))];

  const users = await usersRepository.findByIds(actorIds);
  const usersById = new Map(users.map(user => [user._id?.toString(), user]));

  return history.map(event => {
    const userId = event.status?.userId;
    const actor = resolveActor(userId, usersById.get(userId?.toString()));
    return {
      ...event,
      actor
    };
  });
}

function resolveActor(userId, user) {
  if (!userId) return null;
  if (userId === 'SYSTEM') {
    return { userId, type: 'system', name: 'System' };
  }
  return {
    userId,
    type: 'user',
    name: user?.identity?.name || userId
  };
}

// Deprecated V23 helpers below - avoided in V24 refactors
export async function attachStatus(entity, collection) { return entity; }
export async function attachStatuses(entities, collection) { return entities; }
