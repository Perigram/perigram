/**
 * Pen Templates Service
 */

import * as repository from './repository.js';
import { ObjectId } from 'mongodb';
import { createIdentity, createStatus, createData } from '~/server/utils/blocks';

function toDTO(pen) {
  if (!pen) return null;
  return {
    ...pen,
    ...pen.data,
    name: pen.identity?.name
  };
}

export async function getById(id, userId = null) {
  if (!ObjectId.isValid(id)) {
    throw createError({ statusCode: 400, message: 'Invalid ID format' });
  }
  
  const pen = await repository.findById(id);
  if (!pen) {
    throw createError({ statusCode: 404, message: 'Pen template not found' });
  }
  if (pen.lineage?.userId && userId && pen.lineage.userId.toString() !== userId) {
    throw createError({ statusCode: 403, message: 'Access denied' });
  }
  return toDTO(pen);
}

export async function listAll(userId) {
  const systemPens = await repository.findSystem();
  
  const userPens = userId ? await repository.findByOwner(userId) : [];
  return [...systemPens, ...userPens].map(toDTO);
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
  
  const origin = createStatus('ACTIVE', userId || 'SYSTEM', { note: 'Pen template created' });

  return await repository.create({
    identity: createIdentity(data.name),
    origin,
    status: origin,
    lineage: {
      userId: userId ? userId : null
    },
    data: createData({
      stroke: data.stroke
    })
  });
}

export async function update(id, updates, userId) {
  const pen = await repository.findById(id);
  if (!pen) throw createError({ statusCode: 404, message: 'Pen not found' });
  if (!pen.ownerId) {
    throw createError({ statusCode: 403, message: 'System pens cannot be modified' });
  }
  
  const { identity, origin, status, data: updatesData, ...clean } = updates;
  
  if (updates.name) pen.identity.name = updates.name;

  const penData = {
    ...pen.data,
    ...updatesData,
    ...clean
  };

  await repository.updateById(id, { identity: pen.identity, data: penData });
  const updated = await repository.findById(id);
  return toDTO(updated);
}

export async function remove(id, userId) {
  const pen = await getById(id, userId);
  if (!pen.ownerId) {
    throw createError({ statusCode: 403, message: 'System pens cannot be deleted' });
  }
  await repository.deleteById(id);
  return { success: true };
}
