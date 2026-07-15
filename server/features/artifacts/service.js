import * as repository from './repository.js';
import { createProcessUpdateHandler } from '../_template/process-update-handler.js';
import { createError } from 'h3';
import {
  createAttachment,
  createData,
  createIdentity,
} from '../../core/blocks/index.js';
import { Artifact } from './model.js';
import { toFlexibleId } from '../../utils/objectid.js';
import { generateRandomString } from '../../utils/strings.js';
import * as filesService from '../files/service.js';
import { assertEntityAccess, hasEntityAccess } from '../../core/access/service.js';
import { getLineageFilter } from '../../utils/permissions.js';
import { statusService, createTransitionAuth } from '../../core/machines/service.js';

/**
 * Artifacts Service - v24 Standardized
 */


export async function create(data, userId = 'SYSTEM', userOrg = null, userRole = null, auth = null) {
  const lineage = {
    ...(data.lineage || {}),
    ...(data.queueId ? { queueId: toFlexibleId(data.queueId) } : {}),
    ...(data.runId ? { runId: toFlexibleId(data.runId) } : {})
  };
  if (!lineage.organizationId && userOrg) lineage.organizationId = toFlexibleId(userOrg);
  if (!lineage.organizationId) throw createError({ statusCode: 400, message: 'Artifact organization lineage is required' });
  if (auth) assertEntityAccess({ entity: { lineage }, entityType: 'artifact', feature: 'artifacts', level: 'write', auth });
  const origin = await statusService.initialStatusForOrganization('artifact', lineage.organizationId, userId, { note: 'Artifact record created' });

  const artifactData = {
    identity: createIdentity(data.name || 'New Artifact', `artifact-${generateRandomString(12)}`),
    origin,
    status: origin,
    lineage,
    relations: data.relations || {},
    provenance: data.provenance || {},
    attachments: data.fileId ? {
      primary: createArtifactAttachment(data.type, data.fileId, data.name || 'New Artifact', data.mimeType, data.bucketName)
    } : {},
    data: createData({
      type: data.type,
      metadata: data.metadata || {}
    })
  };

  const raw = await repository.create(artifactData);
  if (data.fileId) {
    await statusService.applyIntent('artifact', raw._id, 'artifactFileStored', createTransitionAuth('SYSTEM', 'SYSTEM'), {
      note: 'Artifact file stored'
    });
  }
  return await getById(raw._id, userId, userOrg, userRole, auth);
}

export async function createUploaded({ buffer, filename, mimeType, type, lineage, metadata = {}, relations = {}, provenance = {} } = {}, auth = {}) {
  if (!buffer?.length) throw createError({ statusCode: 400, message: 'Artifact file is required' });
  const bucketName = bucketNameForType(type);
  const stored = await filesService.uploadFile(buffer, filename || 'upload', {
    userId: auth.userId,
    organizationId: auth.organizationId,
    artifactType: type
  }, bucketName);
  try {
    return await create({
      name: filename || 'Upload',
      type,
      fileId: stored.id,
      mimeType,
      bucketName,
      lineage: { organizationId: auth.organizationId, ...(lineage || {}) },
      metadata: { ...metadata, originalFilename: filename || 'upload' },
      relations,
      provenance
    }, auth.userId, auth.organizationId, auth.role, auth);
  } catch (error) {
    await filesService.deleteFile(stored.id, bucketName).catch(() => {});
    throw error;
  }
}

export async function getById(id, userId = null, userOrg = null, userRole = null, auth = null) {
  const raw = await repository.findById(id);
  if (!raw) throw createError({ statusCode: 404, message: 'Artifact not found' });
  if (auth && !hasEntityAccess({ entity: raw, entityType: 'artifact', feature: 'artifacts', level: 'read', auth })) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  return new Artifact(raw).toJSON();
}

export async function list(filter = {}, userId = null, userOrg = null, userRole = null, auth = null) {
  // Normalize IDs in filters
  if (filter['lineage.queueId']) filter['lineage.queueId'] = toFlexibleId(filter['lineage.queueId']);
  if (filter['lineage.runId']) filter['lineage.runId'] = toFlexibleId(filter['lineage.runId']);

  const finalFilter = auth?.memberships ? { ...getLineageFilter(auth), ...filter } : filter;
  const raws = await repository.find(finalFilter);
  return raws
    .filter(raw => !auth || hasEntityAccess({ entity: raw, entityType: 'artifact', feature: 'artifacts', level: 'read', auth }))
    .map(raw => new Artifact(raw).toJSON());
}

export async function remove(id, userId = null, userOrg = null, userRole = null, auth = null) {
  const artifact = await getById(id, userId, userOrg, userRole, auth);
  if (auth) assertEntityAccess({ entity: artifact, entityType: 'artifact', feature: 'artifacts', level: 'admin', auth });
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

  await repository.updateById(artifact._id, {
    attachments: {
      ...(artifact.attachments || {}),
      primary: createArtifactAttachment(type, fileId, name || artifact.identity?.name || 'Artifact', mimeType)
    },
    updatedAt: new Date()
  });

  await statusService.applyIntent('artifact', artifact._id, 'artifactFileStored', createTransitionAuth('SYSTEM', 'SYSTEM'), {
    note: 'Generated artifact file stored'
  });

  return await getById(artifact._id);
}

function createArtifactAttachment(type, fileId, name, mimeType = '', bucketName = '') {
  return createAttachment(type, fileId, name, {
    mimeType,
    bucketName: bucketName || bucketNameForType(type)
  });
}

export function bucketNameForType(type) {
  if (type === 'LAYOUT_DXF') return 'nestDxf';
  if (type === 'LAYOUT_SVG') return 'nestSvg';
  if (type === 'PDF_PASSPORT') return 'artifacts';
  if (type === 'CAPTURE_PHOTO') return 'capturePhotos';
  if (type === 'DXF_SOURCE') return 'userDxf';
  return 'uploads';
}

export const processUpdate = createProcessUpdateHandler({
  entityType: 'artifact',
  repository,
  Model: Artifact
});
