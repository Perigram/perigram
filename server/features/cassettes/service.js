/**
 * Cassettes Service
 */

import * as repository from './repository.js';
import { ObjectId } from 'mongodb';

export async function getById(id, userId) {
  if (!ObjectId.isValid(id)) {
    throw createError({ statusCode: 400, message: 'Invalid ID format' });
  }
  
  const cassette = await repository.findById(id);
  if (!cassette) {
    throw createError({ statusCode: 404, message: 'Cassette not found' });
  }
  if (cassette.ownerId.toString() !== userId) {
    throw createError({ statusCode: 403, message: 'Access denied' });
  }
  
  return cassette;
}

export async function getBySlug(slug, userId) {
  const cassette = await repository.findBySlug(slug);
  if (!cassette) {
    throw createError({ statusCode: 404, message: 'Cassette not found' });
  }
  if (cassette.ownerId.toString() !== userId) {
    throw createError({ statusCode: 403, message: 'Access denied' });
  }
  return cassette;
}

export async function listForUser(userId, options = {}) {
  return await repository.findByOwner(userId, options);
}

export async function create(data, userId) {
  if (!data.name) {
    throw createError({ statusCode: 400, message: 'Name is required' });
  }
  if (!data.slug) {
    throw createError({ statusCode: 400, message: 'Slug is required' });
  }
  
  // Check slug uniqueness
  const existing = await repository.findBySlug(data.slug);
  if (existing) {
    throw createError({ statusCode: 409, message: 'Slug already exists' });
  }
  
  return await repository.create({
    name: data.name,
    slug: data.slug,
    ownerId: new ObjectId(userId),
    dxfId: data.dxfId || null,
    svgId: data.svgId || null,
    layerMappings: data.layerMappings || [],
    parameters: data.parameters || [],
    boundingBox: data.boundingBox || null,
    area: data.area || 0,
    defaultMaterial: data.defaultMaterial || null
  });
}

export async function updateLayerMappings(id, layerMappings, userId) {
  await getById(id, userId);
  
  if (!Array.isArray(layerMappings)) {
    throw createError({ statusCode: 400, message: 'Layer mappings must be an array' });
  }
  
  await repository.updateById(id, { layerMappings });
  return await repository.findById(id);
}

export async function updateParameters(id, parameters, userId) {
  await getById(id, userId);
  
  if (!Array.isArray(parameters)) {
    throw createError({ statusCode: 400, message: 'Parameters must be an array' });
  }
  
  await repository.updateById(id, { parameters });
  return await repository.findById(id);
}

export async function updateStatus(id, status, userId) {
  await getById(id, userId);
  
  const validStatuses = ['DRAFT', 'ACTIVE', 'ARCHIVED'];
  if (!validStatuses.includes(status)) {
    throw createError({ statusCode: 400, message: 'Invalid status' });
  }
  
  await repository.updateById(id, { status });
  return await repository.findById(id);
}

export async function remove(id, userId) {
  await getById(id, userId);
  await repository.deleteById(id);
  return { success: true };
}
