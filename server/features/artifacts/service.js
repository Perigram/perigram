import * as repository from './repository.js';
import { createError } from 'h3';
import { 
  createIdentity, 
  createStatus, 
  registerService 
} from '../../core/blocks/index.js';
import { Artifact } from './model.js';
import { toFlexibleId } from '../../utils/objectid.js';

/**
 * Artifacts Service - v24 Standardized
 */

registerService('artifact', {
  getById: (uid) => getById(uid)
});

export async function create(data, userId) {
  const origin = createStatus(data.status || 'READY', userId || 'SYSTEM', { note: 'Artifact record created' });

  const artifactData = {
    identity: createIdentity(data.name || 'New Artifact'),
    origin,
    status: origin,
    lineage: data.lineage || {},
    data: {
      type: data.type,
      fileId: data.fileId ? toFlexibleId(data.fileId) : null,
      mimeType: data.mimeType || '',
      metadata: data.metadata || {}
    }
  };

  const raw = await repository.create(artifactData);
  return new Artifact(raw).toJSON();
}

export async function getById(id) {
  const raw = await repository.findById(id);
  if (!raw) throw createError({ statusCode: 404, message: 'Artifact not found' });
  return new Artifact(raw).toJSON();
}

export async function list(filter = {}) {
  // Normalize IDs in filters
  if (filter['lineage.queueId']) filter['lineage.queueId'] = toFlexibleId(filter['lineage.queueId']);
  if (filter['lineage.runId']) filter['lineage.runId'] = toFlexibleId(filter['lineage.runId']);
  
  const raws = await repository.find(filter);
  return raws.map(raw => new Artifact(raw).toJSON());
}

export async function remove(id) {
  return await repository.deleteById(toFlexibleId(id));
}
