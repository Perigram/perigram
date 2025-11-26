/**
 * Tool Profiles Service
 */

import * as repository from './repository.js';
import { ObjectId } from 'mongodb';

export async function getById(id, userId = null) {
  if (!ObjectId.isValid(id)) {
    throw createError({ statusCode: 400, message: 'Invalid ID format' });
  }
  
  const tool = await repository.findById(id);
  if (!tool) {
    throw createError({ statusCode: 404, message: 'Tool profile not found' });
  }
  if (tool.ownerId && userId && tool.ownerId.toString() !== userId) {
    throw createError({ statusCode: 403, message: 'Access denied' });
  }
  return tool;
}

export async function listAll(userId) {
  const [systemTools, userTools] = await Promise.all([
    repository.findSystem(),
    repository.findByOwner(userId)
  ]);
  return [...systemTools, ...userTools];
}

export async function create(data, userId) {
  if (!data.name) throw createError({ statusCode: 400, message: 'Name is required' });
  
  if (typeof data.diameter !== 'number' || data.diameter <= 0) {
    throw createError({ statusCode: 400, message: 'Diameter must be a positive number' });
  }
  
  if (typeof data.angle !== 'number' || data.angle < 0 || data.angle > 180) {
    throw createError({ statusCode: 400, message: 'Angle must be between 0 and 180 degrees' });
  }
  
  return await repository.create({
    name: data.name,
    ownerId: userId || null, // Store userId as string (OAuth format)
    diameter: data.diameter,
    angle: data.angle
  });
}

export async function update(id, updates, userId) {
  const tool = await getById(id, userId);
  if (!tool.ownerId) {
    throw createError({ statusCode: 403, message: 'System tools cannot be modified' });
  }
  
  if (updates.diameter !== undefined) {
    if (typeof updates.diameter !== 'number' || updates.diameter <= 0) {
      throw createError({ statusCode: 400, message: 'Diameter must be a positive number' });
    }
  }
  
  if (updates.angle !== undefined) {
    if (typeof updates.angle !== 'number' || updates.angle < 0 || updates.angle > 180) {
      throw createError({ statusCode: 400, message: 'Angle must be between 0 and 180 degrees' });
    }
  }
  
  delete updates.ownerId;
  delete updates._id;
  delete updates.createdAt;
  
  await repository.updateById(id, updates);
  return await repository.findById(id);
}

export async function remove(id, userId) {
  const tool = await getById(id, userId);
  if (!tool.ownerId) {
    throw createError({ statusCode: 403, message: 'System tools cannot be deleted' });
  }
  await repository.deleteById(id);
  return { success: true };
}
