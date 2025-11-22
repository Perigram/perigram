/**
 * Service Layer Template
 * 
 * Contains ALL business logic and validation.
 * Orchestrates repository calls.
 * Never accesses DB directly.
 */

import * as repository from './repository.js';
import { ObjectId } from 'mongodb';

/**
 * Get single item by ID
 * Validates ownership if required
 */
export async function getById(id, userId = null) {
  if (!ObjectId.isValid(id)) {
    throw createError({ statusCode: 400, message: 'Invalid ID format' });
  }
  
  const item = await repository.findById(id);
  
  if (!item) {
    throw createError({ statusCode: 404, message: 'Item not found' });
  }
  
  // Validate ownership if userId provided
  if (userId && item.ownerId?.toString() !== userId) {
    throw createError({ statusCode: 403, message: 'Access denied' });
  }
  
  return item;
}

/**
 * List items for user
 */
export async function listForUser(userId, options = {}) {
  const query = { ownerId: new ObjectId(userId) };
  return await repository.findMany(query, options);
}

/**
 * List system items (ownerId is null)
 */
export async function listSystem(options = {}) {
  const query = { ownerId: null };
  return await repository.findMany(query, options);
}

/**
 * Create new item
 * Validates input and ownership
 */
export async function create(data, userId) {
  // Validate required fields
  if (!data.name || typeof data.name !== 'string') {
    throw createError({ statusCode: 400, message: 'Name is required' });
  }
  
  // Attach owner
  const itemData = {
    ...data,
    ownerId: userId ? new ObjectId(userId) : null
  };
  
  return await repository.create(itemData);
}

/**
 * Update existing item
 * Validates ownership
 */
export async function update(id, updates, userId) {
  // Verify item exists and user owns it
  const item = await getById(id, userId);
  
  // Validate updates
  if (updates.name && typeof updates.name !== 'string') {
    throw createError({ statusCode: 400, message: 'Invalid name format' });
  }
  
  // Don't allow changing owner
  delete updates.ownerId;
  delete updates._id;
  delete updates.createdAt;
  
  const success = await repository.updateById(id, updates);
  
  if (!success) {
    throw createError({ statusCode: 500, message: 'Update failed' });
  }
  
  return await repository.findById(id);
}

/**
 * Delete item
 * Validates ownership
 */
export async function remove(id, userId) {
  // Verify item exists and user owns it
  await getById(id, userId);
  
  const success = await repository.deleteById(id);
  
  if (!success) {
    throw createError({ statusCode: 500, message: 'Delete failed' });
  }
  
  return { success: true };
}
