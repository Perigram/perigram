/**
 * Materials Service
 */

import * as repository from './repository.js';
import { createError } from 'h3';

export async function list(options = {}) {
  return await repository.find({}, options);
}

export async function getById(id) {
  const material = await repository.findById(id);
  if (!material) {
    throw createError({ statusCode: 404, message: 'Material not found' });
  }
  return material;
}

export async function create(data) {
  if (!data.name || !data.code) {
    throw createError({ statusCode: 400, message: 'Name and Code are required' });
  }
  
  const existing = await repository.findByCode(data.code);
  if (existing) {
    throw createError({ statusCode: 409, message: 'Material code already exists' });
  }
  
  return await repository.create(data);
}

export async function update(id, updates) {
  // Don't allow organizationId change
  delete updates._id;
  delete updates.createdAt;
  delete updates.organizationId;
  
  const success = await repository.updateById(id, updates);
  if (!success) {
    throw createError({ statusCode: 404, message: 'Material not found or no changes made' });
  }
  return await repository.findById(id);
}

export async function remove(id) {
  const success = await repository.deleteById(id);
  if (!success) {
    throw createError({ statusCode: 404, message: 'Material not found' });
  }
  return { success: true };
}
