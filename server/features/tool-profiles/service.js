/**
 * Tool Profiles Service
 */

import * as repository from './repository.js';
import { createIdentity, createStatus, createData } from '../../core/blocks/index.js';
import { createError } from 'h3';
import { ToolProfile } from './model.js';

function toDTO(tool) {
  if (!tool) return null;
  return new ToolProfile(tool).toJSON();
}

export async function getById(id, userId = null) {
  const tool = await repository.findById(id);
  if (!tool) {
    throw createError({ statusCode: 404, message: 'Tool profile not found' });
  }
  // Check ownership if not system tool
  const toolOwnerId = tool.lineage?.userId;
  if (toolOwnerId && userId && toolOwnerId.toString() !== userId.toString()) {
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
  
  const diameter = Number(data.diameter);
  const angle = Number(data.angle);

  if (isNaN(diameter) || diameter <= 0) {
    throw createError({ statusCode: 400, message: 'Diameter must be a positive number' });
  }
  
  const origin = createStatus('ACTIVE', userId || 'SYSTEM', { note: 'Tool profile created' });

  const doc = {
    identity: createIdentity(data.name),
    origin,
    status: origin,
    lineage: {
      userId: userId ? userId : null
    },
    data: createData({
      diameter: diameter,
      angle: isNaN(angle) ? 0 : angle,
      kerf: data.kerf || diameter,
      description: data.description || ''
    })
  };

  const created = await repository.create(doc);
  return toDTO(created);
}

export async function update(id, updates, userId) {
  const tool = await repository.findById(id);
  if (!tool) throw createError({ statusCode: 404, message: 'Tool not found' });
  if (!tool.lineage?.userId) {
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
  if (!tool.lineage?.userId) {
    throw createError({ statusCode: 403, message: 'System tools cannot be deleted' });
  }
  await repository.deleteById(id);
  return { success: true };
}
