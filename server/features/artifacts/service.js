import * as repository from './repository.js';
import { createError } from 'h3';
import {
  createAttachment,
  createIdentity,
  createStatus
} from '../../core/blocks/index.js';
import { Artifact } from './model.js';
import { toFlexibleId } from '../../utils/objectid.js';
import { generateRandomString } from '../../utils/strings.js';
import * as filesService from '../files/service.js';

/**
 * Artifacts Service - v24 Standardized
 */


export async function create(data, userId) {
  const origin = createStatus(data.status || 'READY', userId || 'SYSTEM', { note: 'Artifact record created' });

  const artifactData = {
    identity: { uid: generateRandomString(12), name: data.name || 'New Artifact' },
    origin,
    status: origin,
    lineage: {
      ...(data.lineage || {}),
      ...(data.queueId ? { queueId: toFlexibleId(data.queueId) } : {}),
      ...(data.runId ? { runId: toFlexibleId(data.runId) } : {})
    },
    attachments: data.fileId ? {
      primary: createArtifactAttachment(data.type, data.fileId, data.name || 'New Artifact', data.mimeType)
    } : {},
    data: {
      type: data.type,
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
  const artifact = await getById(id);
  const primary = artifact.attachments?.primary;

  if (primary?.fileId) {
    await filesService.deleteFile(primary.fileId, primary.metadata?.bucketName || bucketNameForType(artifact.data?.type));
  }

  return await repository.deleteById(toFlexibleId(id));
}

export async function markReadyByRun(runId, type, fileId, mimeType, name = '') {
  const filter = {
    'lineage.runId': toFlexibleId(runId),
    'data.type': type
  };

  const artifact = await repository.findOne(filter);
  if (!artifact) return null;

  const status = createStatus('READY', 'SYSTEM', { note: 'File generated' });
  await repository.updateById(artifact._id, {
    status,
    attachments: {
      ...(artifact.attachments || {}),
      primary: createArtifactAttachment(type, fileId, name || artifact.identity?.name || 'Artifact', mimeType)
    },
    updatedAt: new Date()
  });

  return await getById(artifact._id);
}

function createArtifactAttachment(type, fileId, name, mimeType = '') {
  return createAttachment(type, fileId, name, {
    mimeType,
    bucketName: bucketNameForType(type)
  });
}

function bucketNameForType(type) {
  if (type === 'LAYOUT_DXF') return 'nestDxf';
  if (type === 'LAYOUT_SVG') return 'nestSvg';
  if (type === 'PDF_PASSPORT') return 'artifacts';
  return 'uploads';
}
