/**
 * Tool Profiles Service
 */

import * as repository from './repository.js';
import { ObjectId } from 'mongodb';
import { createIdentity, createStatus, createData } from '~/server/utils/blocks';

function toDTO(tool) {
  if (!tool) return null;
  return {
    ...tool,
    ...tool.data,
    name: tool.identity?.name
  };
}

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
  return toDTO(tool);
}

export async function listAll(userId) {
  const [systemTools, userTools] = await Promise.all([
    repository.findSystem(),
    repository.findByOwner(userId)
  ]);
  return [...systemTools, ...userTools].map(toDTO);
}

export async function create(data, userId) {
  if (!data.name) throw createError({ statusCode: 400, message: 'Name is required' });
  
  if (typeof data.diameter !== 'number' || data.diameter <= 0) {
    throw createError({ statusCode: 400, message: 'Diameter must be a positive number' });
  }
  
  if (typeof data.angle !== 'number' || data.angle < 0 || data.angle > 180) {
    throw createError({ statusCode: 400, message: 'Angle must be between 0 and 180 degrees' });
  }
  
  const origin = createStatus('ACTIVE', userId || 'SYSTEM', { note: 'Tool profile created' });

  return await repository.create({
    identity: createIdentity(data.name),
    origin,
    status: origin,
    lineage: {
      userId: userId ? userId : null
    },
    data: createData({
      diameter: data.diameter,
      angle: data.angle
    })
  });
}

export async function update(id, updates, userId) {
  const tool = await repository.findById(id);
  if (!tool) throw createError({ statusCode: 404, message: 'Tool not found' });
  if (!tool.ownerId) {
    throw createError({ statusCode: 403, message: 'System tools cannot be modified' });
  }
  
  const { identity, origin, status, data: updatesData, ...clean } = updates;
  
  if (updates.name) tool.identity.name = updates.name;

  const toolData = {
    ...tool.data,
    ...updatesData,
    ...clean
  };

  await repository.updateById(id, { identity: tool.identity, data: toolData });
  const updated = await repository.findById(id);
  return toDTO(updated);
}

export async function remove(id, userId) {
  const tool = await getById(id, userId);
  if (!tool.ownerId) {
    throw createError({ statusCode: 403, message: 'System tools cannot be deleted' });
  }
  await repository.deleteById(id);
  return { success: true };
}
