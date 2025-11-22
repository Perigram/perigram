/**
 * Batches Service
 */

import * as repository from './repository.js';
import { ObjectId } from 'mongodb';

export async function getById(id, userId) {
  if (!ObjectId.isValid(id)) {
    throw createError({ statusCode: 400, message: 'Invalid ID format' });
  }
  
  const batch = await repository.findById(id);
  if (!batch) {
    throw createError({ statusCode: 404, message: 'Batch not found' });
  }
  if (batch.ownerId.toString() !== userId) {
    throw createError({ statusCode: 403, message: 'Access denied' });
  }
  
  return batch;
}

export async function listByProject(projectSlug, userId, options = {}) {
  return await repository.findByProject(projectSlug, options);
}

export async function listForUser(userId, options = {}) {
  return await repository.findByOwner(userId, options);
}

export async function create(data, userId) {
  if (!data.projectSlug) {
    throw createError({ statusCode: 400, message: 'Project slug is required' });
  }
  if (!data.name) {
    throw createError({ statusCode: 400, message: 'Name is required' });
  }
  if (!Array.isArray(data.entries) || data.entries.length === 0) {
    throw createError({ statusCode: 400, message: 'At least one entry is required' });
  }
  
  // Validate entries
  for (const entry of data.entries) {
    if (!entry.entryId || !entry.cassetteTemplateId || !entry.quantity) {
      throw createError({ statusCode: 400, message: 'Invalid entry format' });
    }
    if (!ObjectId.isValid(entry.cassetteTemplateId)) {
      throw createError({ statusCode: 400, message: 'Invalid cassette template ID' });
    }
  }
  
  const batchNumber = await repository.getNextBatchNumber(data.projectSlug);
  
  return await repository.create({
    projectSlug: data.projectSlug,
    batchNumber,
    name: data.name,
    ownerId: new ObjectId(userId),
    entries: data.entries.map(e => ({
      ...e,
      cassetteTemplateId: new ObjectId(e.cassetteTemplateId)
    })),
    additionalFiles: data.additionalFiles || [],
    previousRemainder: data.previousRemainder || null
  });
}

export async function update(id, updates, userId) {
  await getById(id, userId);
  
  const allowedUpdates = ['name', 'entries', 'additionalFiles', 'previousRemainder'];
  const filteredUpdates = {};
  
  for (const key of allowedUpdates) {
    if (updates[key] !== undefined) {
      filteredUpdates[key] = updates[key];
    }
  }
  
  if (Object.keys(filteredUpdates).length === 0) {
    throw createError({ statusCode: 400, message: 'No valid updates provided' });
  }
  
  await repository.updateById(id, filteredUpdates);
  return await repository.findById(id);
}

export async function updateStatus(id, status, userId) {
  await getById(id, userId);
  
  const validStatuses = ['DRAFT', 'READY', 'NESTING', 'COMPLETE', 'FAILED'];
  if (!validStatuses.includes(status)) {
    throw createError({ statusCode: 400, message: 'Invalid status' });
  }
  
  await repository.updateById(id, { status });
  return await repository.findById(id);
}

export async function remove(id, userId) {
  const batch = await getById(id, userId);
  
  if (batch.status === 'NESTING') {
    throw createError({ statusCode: 400, message: 'Cannot delete batch in progress' });
  }
  
  await repository.deleteById(id);
  return { success: true };
}

export async function getArtifacts(id, userId) {
  const batch = await getById(id, userId);
  return batch.artifacts || [];
}
