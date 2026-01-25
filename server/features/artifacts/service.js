import * as repository from './repository.js';
import { createError } from 'h3';
import { createIdentity, createStatus, inheritLineage } from '~/server/utils/blocks';
import { statusService } from '~/server/core/machines/service';
import { ObjectId } from 'mongodb';

/**
 * Artifacts Service - v24 Standardized
 */

export async function createFromParent(parent, data, userId, userRole) {
  const { type, fileId, metadata, name } = data;

  if (!type || !fileId) {
    throw createError({ statusCode: 400, message: 'type and fileId are required' });
  }

  // 1. Lineage Inheritance
  const parentType = data.parentType || 'unknown'; // e.g. 'queue', 'run', 'sheet'
  const lineage = inheritLineage(parent, parentType);

  const origin = createStatus('READY', userId || 'SYSTEM', { note: 'Artifact generated' });

  const artifactData = {
    identity: createIdentity(name || `Artifact ${type}`),
    type,
    fileId: new ObjectId(fileId),
    lineage,
    origin,
    status: origin,
    metadata: metadata || {}
  };

  return await repository.create(artifactData);
}

export async function create(data) {
    // For manual creation or from nest service where lineage is already passed or needs to be constructed
    const { type, name, status, metadata, queueId, runId } = data;
    
    const artifactData = {
        identity: createIdentity(name || `Artifact ${type}`),
        type,
        lineage: {
            queueId: queueId ? new ObjectId(queueId) : null,
            runId: runId ? new ObjectId(runId) : null
        },
        origin: createStatus(status || 'GENERATING', 'SYSTEM'),
        status: createStatus(status || 'GENERATING', 'SYSTEM'),
        metadata: metadata || {}
    };

    return await repository.create(artifactData);
}

export async function getById(id) {
  if (!ObjectId.isValid(id)) {
    throw createError({ statusCode: 400, message: 'Invalid ID format' });
  }
  
  const artifact = await repository.findById(id);
  if (!artifact) {
    throw createError({ statusCode: 404, message: 'Artifact not found' });
  }
  
  return artifact;
}

export async function list(filter = {}) {
  return await repository.find(filter);
}

export async function update(id, updates, userId, userRole) {
  const artifact = await getById(id);
  
  if (updates.status) {
    await statusService.transition('artifact', artifact._id, updates.status, userId, userRole, updates.statusMeta || {});
    delete updates.status;
  }

  const { identity, origin, status, lineage, ...clean } = updates;
  
  if (updates.name) artifact.identity.name = updates.name;

  await repository.updateById(id, { identity: artifact.identity, ...clean });
  return await repository.findById(id);
}

export async function remove(id) {
  const artifact = await getById(id);
  
  // GridFS deletion should be handled here or in repo
  
  return await repository.deleteById(id);
}