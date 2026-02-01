import * as repository from './repository.js';
import { createError } from 'h3';
import { createIdentity, inheritLineage, Lineage } from '~/server/utils/blocks';
import { Artifact } from './model.js';
import { statusService } from '~/server/core/machines/service';
import { generateRandomString } from '~/server/utils/strings';
import { ObjectId } from 'mongodb';

/**
 * Artifacts Service - v24 Standardized with Entity Abstractions
 */

export async function createFromParent(parent, data, userId, userRole) {
  const { type, fileId, metadata, name } = data;

  if (!type || !fileId) {
    throw createError({ statusCode: 400, message: 'type and fileId are required' });
  }

  // 1. Abstraction handles identity and lineage
  const uid = `art-${generateRandomString(8)}`;
  const artifact = new Artifact({
    identity: { uid },
    lineage: inheritLineage(parent, data.parentType || 'unknown'),
    params: { type, fileId, name, metadata } // Specialized constructor handles the 'data' block
  });

  artifact.applyStatus('READY', userId || 'SYSTEM', { note: 'Artifact generated' });

  const createdRaw = await repository.create(artifact);
  return new Artifact(createdRaw);
}

export async function create(data) {
    const { type, name, status, metadata, queueId, runId } = data;
    
    const uid = `art-${generateRandomString(8)}`;
    const artifact = new Artifact({
        identity: { uid },
        lineage: new Lineage().add('queue', queueId).add('run', runId),
        params: { type, fileId: data.fileId, name, metadata }
    });

    artifact.applyStatus(status || 'GENERATING', 'SYSTEM');

    const createdRaw = await repository.create(artifact);
    return new Artifact(createdRaw);
}

export async function getById(id) {
  if (!ObjectId.isValid(id)) {
    throw createError({ statusCode: 400, message: 'Invalid ID format' });
  }
  const raw = await repository.findById(id);
  if (!raw) throw createError({ statusCode: 404, message: 'Artifact not found' });
  return new Artifact(raw);
}

export async function list(filter = {}) {
  const raws = await repository.find(filter);
  return raws.map(raw => new Artifact(raw));
}

export async function update(id, updates, userId, userRole) {
  const raw = await repository.findById(id);
  if (!raw) throw createError({ statusCode: 404, message: 'Artifact not found' });
  
  if (updates.status) {
    await statusService.transition('artifact', raw._id, updates.status, userId, userRole, updates.statusMeta || {});
    return await getById(id);
  }

  const artifact = new Artifact(raw);
  if (updates.name) artifact.identity.name = updates.name;
  
  // Merge specialized updates into the data block
  artifact.data = { ...artifact.data, ...(updates.data || {}) };

  await repository.updateById(id, { identity: artifact.identity, data: artifact.data });
  const updatedRaw = await repository.findById(id);
  return new Artifact(updatedRaw);
}

export async function remove(id) {
  await getById(id);
  return await repository.deleteById(id);
}
