/**
 * Pen Templates Service
 */

import * as repository from './repository.js';
import { ObjectId } from 'mongodb';

export async function getById(id, userId = null) {
  if (!ObjectId.isValid(id)) {
    throw createError({ statusCode: 400, message: 'Invalid ID format' });
  }
  
  const pen = await repository.findById(id);
  if (!pen) {
    throw createError({ statusCode: 404, message: 'Pen template not found' });
  }
  if (pen.ownerId && userId && pen.ownerId.toString() !== userId) {
    throw createError({ statusCode: 403, message: 'Access denied' });
  }
  return pen;
}

export async function listAll(userId) {
  const systemPens = await repository.findSystem();
  
  if (!userId) {
    return systemPens;
  }
  
  const userPens = await repository.findByOwner(userId);
  return [...systemPens, ...userPens];
}

export async function create(data, userId) {
  if (!data.name) throw createError({ statusCode: 400, message: 'Name is required' });
  if (!data.stroke) throw createError({ statusCode: 400, message: 'Stroke is required' });
  
  const validPatterns = ['SOLID', 'DASHED', 'DOTTED'];
  if (!validPatterns.includes(data.stroke.pattern)) {
    throw createError({ statusCode: 400, message: 'Invalid pattern' });
  }
  if (!/^#[0-9A-F]{6}$/i.test(data.stroke.color)) {
    throw createError({ statusCode: 400, message: 'Invalid color format' });
  }
  if (data.stroke.weight <= 0) {
    throw createError({ statusCode: 400, message: 'Invalid weight' });
  }
  
  return await repository.create({
    name: data.name,
    ownerId: userId || null, // Store userId as string (OAuth format)
    stroke: data.stroke
  });
}

export async function update(id, updates, userId) {
  const pen = await getById(id, userId);
  if (!pen.ownerId) {
    throw createError({ statusCode: 403, message: 'System pens cannot be modified' });
  }
  
  delete updates.ownerId;
  delete updates._id;
  delete updates.createdAt;
  
  await repository.updateById(id, updates);
  return await repository.findById(id);
}

export async function remove(id, userId) {
  const pen = await getById(id, userId);
  if (!pen.ownerId) {
    throw createError({ statusCode: 403, message: 'System pens cannot be deleted' });
  }
  await repository.deleteById(id);
  return { success: true };
}
