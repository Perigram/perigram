import { createError } from 'h3';
import * as repository from './repository.js';
import { ArtifactTemplate } from './model.js';
import { createAttachment, createData, createIdentity } from '../../core/blocks/index.js';
import { assertEntityAccess, hasInstanceAccess } from '../../core/access/service.js';
import { getLineageFilter } from '../../utils/permissions.js';
import * as filesService from '../files/service.js';
import * as instanceRevisionsService from '../instance-revisions/service.js';
import { createProcessUpdateHandler } from '../_template/process-update-handler.js';
import { normalizeTemplateLayout, parseTemplate, renderTemplate, templateFormatFor, templateVariables } from './format.js';
import { statusService } from '../../core/machines/service.js';

const REVISION_SCOPE = 'layout';
const BUCKET = 'artifactTemplates';

function toDTO(raw) {
  return raw ? new ArtifactTemplate(raw).toJSON() : null;
}

function revisionPointer(revision) {
  return revision ? {
    currentId: revision._id,
    number: revision.data?.number || 0,
    contentHash: revision.data?.contentHash || ''
  } : null;
}

async function ensureLayoutRevision(template, userId, reason) {
  return await instanceRevisionsService.ensureForEntitySnapshot({
    typeId: 'artifact_template',
    entity: template,
    scope: REVISION_SCOPE,
    content: { layout: template.data?.layout || null },
    snapshot: {
      identity: template.identity || null,
      data: { format: template.data?.format, layout: template.data?.layout || null }
    },
    userId,
    reason
  });
}

export async function createUploaded({ buffer, filename, mimeType, name } = {}, auth = {}) {
  if (!buffer?.length) throw createError({ statusCode: 400, message: 'Artifact template file is required' });
  if (!auth.organizationId) throw createError({ statusCode: 403, message: 'Organization membership is required' });
  const format = templateFormatFor(filename, mimeType);
  const lineage = { organizationId: auth.organizationId };
  assertEntityAccess({ entity: { lineage }, typeId: 'artifact_template', feature: 'artifact_templates', level: 'write', action: 'create', auth });
  const layout = await parseTemplate(buffer, { filename, mimeType });
  const stored = await filesService.uploadFile(buffer, filename || `template.${format.toLowerCase()}`, {
    userId: auth.userId,
    organizationId: auth.organizationId,
    typeId: 'artifact_template',
    format
  }, BUCKET);
  const status = await statusService.initialStatusForOrganization(
    'artifact_template',
    auth.organizationId,
    auth.userId,
    { note: 'Artifact template uploaded' }
  );
  let created = null;
  try {
    created = await repository.create({
      identity: createIdentity(name || filename || 'Artifact template'),
      origin: status,
      status,
      lineage,
      relations: {},
      provenance: {},
      attachments: {
        source: createAttachment('ARTIFACT_TEMPLATE_SOURCE', stored.id, filename || stored.filename, {
          mimeType,
          bucketName: BUCKET,
          format
        })
      },
      data: createData({ format, layout, variables: templateVariables(layout), activeRevisionId: null, revisions: {} })
    });
    const revision = await ensureLayoutRevision(created, auth.userId, 'template-uploaded');
    created = await repository.updateById(created._id, {
      'data.activeRevisionId': revision._id,
      'data.revisions.layout': revisionPointer(revision)
    });
    return toDTO(created);
  } catch (error) {
    if (created?._id) await repository.deleteById(created._id).catch(() => {});
    await filesService.deleteFile(stored.id, BUCKET).catch(() => {});
    throw error;
  }
}

export async function getById(id, userId = null, userOrg = null, userRole = null, auth = null) {
  const raw = await repository.findById(id);
  if (!raw) throw createError({ statusCode: 404, message: 'Artifact template not found' });
  if (auth && !hasInstanceAccess({ entity: raw, typeId: 'artifact_template', feature: 'artifact_templates', level: 'read', auth })) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  return toDTO(raw);
}

export async function list(filter = {}, userId = null, userOrg = null, userRole = null, auth = null) {
  const finalFilter = auth?.memberships ? { ...getLineageFilter(auth), ...filter } : filter;
  const raws = await repository.find(finalFilter);
  return raws
    .filter(raw => !auth || hasInstanceAccess({ entity: raw, typeId: 'artifact_template', feature: 'artifact_templates', level: 'read', auth }))
    .map(toDTO);
}

export async function replaceLayout(id, layout, auth = {}) {
  const current = await getById(id, auth.userId, auth.organizationId, auth.role, auth);
  assertEntityAccess({ entity: current, typeId: 'artifact_template', feature: 'artifact_templates', level: 'write', action: 'update', auth });
  const normalized = normalizeTemplateLayout(layout, current.data?.format);
  const candidate = {
    ...current,
    data: { ...(current.data || {}), layout: normalized, variables: templateVariables(normalized) }
  };
  const revision = await ensureLayoutRevision(candidate, auth.userId, 'template-layout-updated');
  const updated = await repository.updateById(id, {
    'data.layout': normalized,
    'data.variables': templateVariables(normalized),
    'data.activeRevisionId': revision._id,
    'data.revisions.layout': revisionPointer(revision),
    updatedAt: new Date()
  });
  if (!updated) throw createError({ statusCode: 409, message: 'Artifact template changed before the layout revision was saved' });
  return toDTO(updated);
}

export async function render(id, { revisionId = null, values = {}, layout = null } = {}, auth = {}) {
  const template = await getById(id, auth.userId, auth.organizationId, auth.role, auth);
  const source = template.attachments?.source;
  if (!source?.fileId) throw createError({ statusCode: 409, message: 'Artifact template source file is missing' });
  let selectedLayout = layout ? normalizeTemplateLayout(layout, template.data?.format) : template.data?.layout;
  let selectedRevisionId = revisionId || template.data?.activeRevisionId || null;
  if (revisionId) {
    const revision = await instanceRevisionsService.getById(revisionId, auth.userId, auth.role, auth);
    if (revision.data?.source?.type !== 'artifact_template' || String(revision.data?.source?.id) !== String(template._id)) {
      throw createError({ statusCode: 400, message: 'Artifact template revision does not belong to the selected template' });
    }
    selectedLayout = revision.data?.snapshot?.data?.layout;
  }
  const sourceBuffer = await filesService.getFileBuffer(source.fileId, source.metadata?.bucketName || BUCKET);
  const buffer = await renderTemplate(sourceBuffer, template.data?.format, selectedLayout, values);
  return {
    buffer,
    format: template.data?.format,
    mimeType: template.data?.format === 'PDF' ? 'application/pdf' : 'application/dxf',
    extension: template.data?.format === 'PDF' ? 'pdf' : 'dxf',
    layout: selectedLayout,
    variables: templateVariables(selectedLayout),
    template,
    revisionId: selectedRevisionId
  };
}

export async function sourceFile(id, auth = {}) {
  const template = await getById(id, auth.userId, auth.organizationId, auth.role, auth);
  const source = template.attachments?.source;
  if (!source?.fileId) throw createError({ statusCode: 404, message: 'Artifact template source file not found' });
  return {
    stream: await filesService.getFileStream(source.fileId, source.metadata?.bucketName || BUCKET),
    name: source.name || template.identity?.name,
    mimeType: source.metadata?.mimeType || (template.data?.format === 'PDF' ? 'application/pdf' : 'application/dxf')
  };
}

export async function remove(id, userId = null, userOrg = null, userRole = null, auth = null) {
  const template = await getById(id, userId, userOrg, userRole, auth);
  if (auth) assertEntityAccess({ entity: template, typeId: 'artifact_template', feature: 'artifact_templates', level: 'admin', action: 'delete', auth });
  const source = template.attachments?.source;
  const result = await repository.deleteById(id);
  if (!result?.deletedCount) throw createError({ statusCode: 409, message: 'Artifact template was not deleted' });
  if (source?.fileId) await filesService.deleteFile(source.fileId, source.metadata?.bucketName || BUCKET).catch(() => {});
  return result;
}

export const processUpdate = createProcessUpdateHandler({
  typeId: 'artifact_template',
  repository,
  Model: ArtifactTemplate
});
