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
import * as entityRevisionsService from '../entity-revisions/service.js';
import * as artifactTemplatesService from '../artifact-templates/service.js';

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
      metadata: data.metadata || {},
      layout: data.layout || null,
      values: data.values || {},
      revisions: data.revisions || {}
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

export async function createUploaded({ buffer, filename, name, mimeType, type, lineage, metadata = {}, relations = {}, provenance = {} } = {}, auth = {}) {
  if (!buffer?.length) throw createError({ statusCode: 400, message: 'Artifact file is required' });
  if (type === 'FACADE_MODEL_SOURCE') validateFacadeModel(buffer, filename);
  const bucketName = bucketNameForType(type);
  const stored = await filesService.uploadFile(buffer, filename || 'upload', {
    userId: auth.userId,
    organizationId: auth.organizationId,
    artifactType: type
  }, bucketName);
  try {
    const artifact = await create({
      name: name || filename || 'Upload',
      type,
      fileId: stored.id,
      mimeType,
      bucketName,
      lineage: { organizationId: auth.organizationId, ...(lineage || {}) },
      metadata: { ...metadata, originalFilename: filename || 'upload' },
      relations,
      provenance
    }, auth.userId, auth.organizationId, auth.role, auth);
    return await createFileRevision(artifact, auth.userId, 'artifact-uploaded');
  } catch (error) {
    await filesService.deleteFile(stored.id, bucketName).catch(() => {});
    throw error;
  }
}

function validateFacadeModel(buffer, filename = '') {
  if (/\.glb$/i.test(filename)) {
    if (buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'glTF') {
      throw createError({ statusCode: 400, message: 'Facade model must be a valid GLB file' });
    }
    return;
  }
  if (!/\.gltf$/i.test(filename)) throw createError({ statusCode: 400, message: 'Facade model must be GLB or GLTF' });
  let document;
  try { document = JSON.parse(buffer.toString('utf8')); } catch { throw createError({ statusCode: 400, message: 'Facade GLTF must be valid JSON' }); }
  const resources = [...(document.buffers || []), ...(document.images || [])];
  if (resources.some(resource => resource?.uri && !String(resource.uri).startsWith('data:'))) {
    throw createError({ statusCode: 400, message: 'Facade GLTF must embed all buffers and images' });
  }
}

export async function createRendered({ buffer, filename, mimeType, type, lineage, metadata = {}, provenance = {}, layout, values = {} } = {}, auth = {}) {
  if (!layout) throw createError({ statusCode: 400, message: 'Rendered artifact layout is required' });
  const bucketName = bucketNameForType(type);
  const stored = await filesService.uploadFile(buffer, filename, {
    userId: auth.userId,
    organizationId: auth.organizationId,
    artifactType: type
  }, bucketName);
  let artifact = null;
  try {
    artifact = await create({
      name: filename,
      type,
      fileId: stored.id,
      mimeType,
      bucketName,
      lineage,
      metadata,
      provenance,
      layout,
      values
    }, auth.userId, auth.organizationId, auth.role, auth);
    const revision = await ensureLayoutRevision(artifact, auth.userId, 'artifact-generated');
    const fileRevision = await ensureFileRevision(artifact, auth.userId, 'artifact-generated');
    const updated = await repository.updateById(artifact._id, {
      'data.revisions.layout': revisionPointer(revision),
      'data.revisions.file': revisionPointer(fileRevision)
    });
    if (!updated) throw createError({ statusCode: 409, message: 'Artifact changed before its generated layout revision was saved' });
    return new Artifact(updated).toJSON();
  } catch (error) {
    if (artifact?._id) await repository.deleteById(artifact._id).catch(() => {});
    await filesService.deleteFile(stored.id, bucketName).catch(() => {});
    throw error;
  }
}

export async function updateDetails(id, { name, metadata } = {}, auth = {}) {
  const artifact = await getById(id, auth.userId, auth.organizationId, auth.role, auth);
  assertEntityAccess({ entity: artifact, entityType: 'artifact', feature: 'artifacts', level: 'write', action: 'update', auth });
  const patch = { 'identity.name': String(name || artifact.identity?.name || '').trim() };
  if (metadata !== undefined) {
    patch['data.metadata'] = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
  }
  return await processUpdate(id, patch, auth);
}

export async function replaceUploadedFile(id, { buffer, filename, mimeType } = {}, auth = {}) {
  if (!buffer?.length) throw createError({ statusCode: 400, message: 'Artifact file is required' });
  const artifact = await getById(id, auth.userId, auth.organizationId, auth.role, auth);
  assertEntityAccess({ entity: artifact, entityType: 'artifact', feature: 'artifacts', level: 'write', action: 'update', auth });
  const type = artifact.data?.type;
  if (type === 'FACADE_MODEL_SOURCE') throw createError({ statusCode: 409, message: 'Facade model source artifacts are immutable' });
  const bucketName = bucketNameForType(type);
  const stored = await filesService.uploadFile(buffer, filename || artifact.identity?.name || 'upload', {
    userId: auth.userId,
    organizationId: auth.organizationId,
    artifactType: type
  }, bucketName);
  try {
    const attachments = {
      ...(artifact.attachments || {}),
      primary: createArtifactAttachment(type, stored.id, filename || artifact.identity?.name, mimeType, bucketName)
    };
    const fileRevision = await ensureFileRevision({ ...artifact, attachments }, auth.userId, 'artifact-file-replaced');
    const updated = await repository.updateById(id, {
      attachments,
      'data.revisions.file': revisionPointer(fileRevision),
      updatedAt: new Date()
    });
    if (!updated) throw createError({ statusCode: 404, message: 'Artifact not found' });
    return new Artifact(updated).toJSON();
  } catch (error) {
    await filesService.deleteFile(stored.id, bucketName).catch(() => {});
    throw error;
  }
}

export async function restoreFileRevision(id, revisionId, auth = {}) {
  const artifact = await getById(id, auth.userId, auth.organizationId, auth.role, auth);
  assertEntityAccess({ entity: artifact, entityType: 'artifact', feature: 'artifacts', level: 'write', action: 'update', auth });
  const revision = await entityRevisionsService.getById(revisionId, auth.userId, auth.role, auth);
  if (revision.data?.source?.type !== 'artifact' || String(revision.data?.source?.id) !== String(artifact._id)) {
    throw createError({ statusCode: 404, message: 'Artifact revision not found' });
  }
  const source = revision.attachments?.primary;
  if (!source?.fileId) throw createError({ statusCode: 409, message: 'Artifact revision has no file' });
  const bucketName = bucketNameForType(artifact.data?.type);
  const buffer = await filesService.getFileBuffer(source.fileId, source.metadata?.bucketName || source.bucketName || bucketName);
  const filename = source.name || artifact.identity?.name || 'artifact';
  const stored = await filesService.uploadFile(buffer, filename, {
    userId: auth.userId,
    organizationId: auth.organizationId,
    artifactType: artifact.data?.type
  }, bucketName);
  try {
    const attachments = {
      ...(artifact.attachments || {}),
      primary: createArtifactAttachment(artifact.data?.type, stored.id, filename, source.metadata?.mimeType, bucketName)
    };
    const fileRevision = await ensureFileRevision({ ...artifact, attachments }, auth.userId, 'artifact-file-restored');
    const updated = await repository.updateById(id, {
      attachments,
      'data.revisions.file': revisionPointer(fileRevision),
      updatedAt: new Date()
    });
    return new Artifact(updated).toJSON();
  } catch (error) {
    await filesService.deleteFile(stored.id, bucketName).catch(() => {});
    throw error;
  }
}

export async function replaceLayout(id, layout, values = {}, auth = {}) {
  const artifact = await getById(id, auth.userId, auth.organizationId, auth.role, auth);
  assertEntityAccess({ entity: artifact, entityType: 'artifact', feature: 'artifacts', level: 'write', action: 'update', auth });
  const templateSource = artifact.provenance?.template?.source;
  if (!templateSource?.id) throw createError({ statusCode: 409, message: 'Artifact has no editable template provenance' });
  const rendered = await artifactTemplatesService.render(templateSource.id, {
    revisionId: templateSource.revisionId,
    values,
    layout
  }, auth);
  const bucketName = bucketNameForType(artifact.data?.type);
  const filename = artifact.attachments?.primary?.name || artifact.identity?.name || `artifact.${rendered.extension}`;
  const stored = await filesService.uploadFile(rendered.buffer, filename, {
    userId: auth.userId,
    organizationId: auth.organizationId,
    artifactType: artifact.data?.type
  }, bucketName);
  const candidate = {
    ...artifact,
    attachments: {
      ...(artifact.attachments || {}),
      primary: createArtifactAttachment(artifact.data?.type, stored.id, filename, rendered.mimeType, bucketName)
    },
    data: {
      ...(artifact.data || {}),
      layout: rendered.layout,
      values
    }
  };
  try {
    const revision = await ensureLayoutRevision(candidate, auth.userId, 'artifact-layout-updated');
    const fileRevision = await ensureFileRevision(candidate, auth.userId, 'artifact-layout-updated');
    const updated = await repository.updateById(id, {
      attachments: candidate.attachments,
      'data.layout': rendered.layout,
      'data.values': values,
      'data.revisions.layout': revisionPointer(revision),
      'data.revisions.file': revisionPointer(fileRevision),
      updatedAt: new Date()
    });
    if (!updated) throw createError({ statusCode: 409, message: 'Artifact changed before its layout revision was saved' });
    return new Artifact(updated).toJSON();
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
  const revisions = await entityRevisionsService.removeForEntity('artifact', artifact._id);
  const files = [artifact.attachments?.primary, ...revisions.map(revision => revision.attachments?.primary)]
    .filter(attachment => attachment?.fileId);
  const seen = new Set();
  for (const attachment of files) {
    const bucket = attachment.metadata?.bucketName || attachment.bucketName || bucketNameForType(artifact.data?.type);
    const key = `${bucket}:${attachment.fileId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await filesService.deleteFile(attachment.fileId, bucket);
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

  const attachments = {
    ...(artifact.attachments || {}),
    primary: createArtifactAttachment(type, fileId, name || artifact.identity?.name || 'Artifact', mimeType)
  };
  const fileRevision = await ensureFileRevision({ ...artifact, attachments }, 'SYSTEM', 'artifact-generated');
  await repository.updateById(artifact._id, {
    attachments,
    'data.revisions.file': revisionPointer(fileRevision),
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
  if (type === 'FACADE_MODEL_SOURCE') return 'facadeModels';
  if (type === 'LAYOUT_DXF') return 'nestDxf';
  if (type === 'LAYOUT_SVG') return 'nestSvg';
  if (type === 'PDF_PASSPORT') return 'artifacts';
  if (type === 'CAPTURE_PHOTO') return 'capturePhotos';
  if (type === 'DXF_SOURCE') return 'userDxf';
  return 'uploads';
}

function revisionPointer(revision) {
  return revision ? {
    currentId: revision._id,
    number: revision.data?.number || 0,
    contentHash: revision.data?.contentHash || ''
  } : null;
}

async function createFileRevision(artifact, userId, reason) {
  const revision = await ensureFileRevision(artifact, userId, reason);
  const updated = await repository.updateById(artifact._id, {
    'data.revisions.file': revisionPointer(revision),
    updatedAt: new Date()
  });
  return new Artifact(updated || artifact).toJSON();
}

async function ensureFileRevision(artifact, userId, reason) {
  const primary = artifact.attachments?.primary;
  if (!primary?.fileId) throw createError({ statusCode: 409, message: 'Artifact file is required for revisioning' });
  return await entityRevisionsService.ensureForEntitySnapshot({
    entityType: 'artifact',
    entity: artifact,
    scope: 'file',
    content: { fileId: String(primary.fileId), attachment: primary },
    snapshot: {
      identity: artifact.identity || null,
      data: { type: artifact.data?.type, layout: artifact.data?.layout || null, values: artifact.data?.values || {} }
    },
    attachments: { primary },
    userId,
    reason
  });
}

async function ensureLayoutRevision(artifact, userId, reason) {
  return await entityRevisionsService.ensureForEntitySnapshot({
    entityType: 'artifact',
    entity: artifact,
    scope: 'layout',
    content: { layout: artifact.data?.layout || null, values: artifact.data?.values || {} },
    snapshot: {
      identity: artifact.identity || null,
      data: { type: artifact.data?.type, layout: artifact.data?.layout || null, values: artifact.data?.values || {} }
    },
    userId,
    reason
  });
}

export const processUpdate = createProcessUpdateHandler({
  entityType: 'artifact',
  repository,
  Model: Artifact
});
