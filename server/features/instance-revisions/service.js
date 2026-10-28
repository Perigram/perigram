import crypto from 'node:crypto';
import * as repository from './repository.js';
import { createError } from 'h3';
import {
  createData,
  createInstanceRef,
  createProvenance,
  Identity
} from '../../core/blocks/index.js';
import * as workflowOverridesService from '../workflow-overrides/service.js';
import { toFlexibleId } from '../../utils/objectid.js';
import { EntityRevision } from './model.js';
import { stateService } from '../../core/machines/service.js';

const DEFAULT_SCOPE = 'content';

function toDTO(revision) {
  if (!revision) return null;
  return new EntityRevision(revision).toJSON();
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  return Object.keys(value).sort().reduce((result, key) => {
    const next = value[key];
    if (next !== undefined) result[key] = sortValue(next);
    return result;
  }, {});
}

export function canonicalizeRevisionContent(content = {}) {
  return JSON.stringify(sortValue(content));
}

export function hashRevisionContent(content = {}) {
  return `sha256:${crypto
    .createHash('sha256')
    .update(canonicalizeRevisionContent(content))
    .digest('hex')}`;
}

export function revisionIdentity(typeId, instanceId, scope, number) {
  const sourceId = toFlexibleId(instanceId).toString();
  return new Identity(
    `revision:${typeId}:${sourceId}:${scope}:${number}`,
    `${typeId} ${scope} v${number}`
  );
}

// Revision reads follow their source records' read law: org-scoped, with
// system revisions (no organization) admitted beside org rows.
function canReadRevision(userPermissions, revision) {
  if (!userPermissions) return true;
  const orgId = (revision?.lineage?.organizationId ?? revision?.organizationId)?.toString?.() || null;
  if (!orgId) return true;
  const activeOrgId = userPermissions.organizationId?.toString?.() || null;
  return Boolean(activeOrgId) && orgId === activeOrgId;
}

export function derivedFromRevision(revision, parameters = {}) {
  const data = revision?.data || {};
  const { source = {} } = data;
  return createProvenance(
    createInstanceRef(source.type, source.id, revision?._id || data.revisionId || data.id),
    {
    scope: data.scope,
    revisionNumber: data.number,
    contentHash: data.contentHash,
    sourceStatus: data.sourceStatus || null,
    parameters: parameters || {}
    }
  );
}

export async function ensureForEntitySnapshot({
  typeId,
  entity,
  scope = DEFAULT_SCOPE,
  content,
  snapshot,
  attachments = {},
  userId = 'SYSTEM',
  reason = 'content-change'
} = {}) {
  if (!typeId) throw createError({ statusCode: 400, message: 'Revision typeId is required' });
  if (!entity?._id) throw createError({ statusCode: 400, message: 'Revision entity is required' });
  if (!content) throw createError({ statusCode: 400, message: 'Revision content is required' });

  await repository.ensureIndexes();

  const instanceId = toFlexibleId(entity._id);
  const contentHash = hashRevisionContent(content);
  const existing = await repository.findByHash(typeId, instanceId, scope, contentHash);
  if (existing) return toDTO(existing);

  const latest = await repository.findLatest(typeId, instanceId, scope);
  const number = Number(latest?.data?.number || 0) + 1;
  const revisionMachine = await workflowOverridesService.resolveActiveWorkflow({
    typeId: 'entity_revision',
    organizationId: entity.organizationId
  });
  const origin = revisionMachine
    ? await stateService.initialStatusForOrganization(
      'entity_revision',
      entity.organizationId,
      userId,
      { note: 'Entity revision created' }
    )
    : null;

  const doc = {
    identity: revisionIdentity(typeId, instanceId, scope, number),
    ...(origin ? { origin, status: origin } : {}),
    lineage: {
      ...(entity.lineage || {}),
      [`${typeId}Id`]: instanceId
    },
    attachments,
    data: createData({
      source: createInstanceRef(typeId, instanceId),
      scope,
      number,
      contentHash,
      createdAt: new Date().toISOString(),
      snapshot: snapshot || {
        name: entity.name ?? null,
        fields: entity.fields || {},
        state: entity.state ?? null
      },
      sourceStatus: entity.state ?? null,
      reason
    })
  };

  try {
    return toDTO(await repository.create(doc));
  } catch (error) {
    if (error?.code === 11000) {
      const concurrent = await repository.findByHash(typeId, instanceId, scope, contentHash);
      if (concurrent) return toDTO(concurrent);
    }
    throw error;
  }
}

export async function getCurrentForEntity(typeId, instanceId, scope = DEFAULT_SCOPE) {
  return toDTO(await repository.findLatest(typeId, toFlexibleId(instanceId), scope));
}

// The pinned-ref read (SPEC §24 version fabric): a ref pinned to a
// revision consumes the bytes that revision froze — its primary
// attachment — whatever the source's current payload holds.
export async function pinnedRevisionFile(revisionId) {
  const revision = await repository.findById(revisionId);
  const primary = revision?.attachments?.primary;
  if (!primary?.fileId) return null;
  return {
    fileId: String(primary.fileId),
    bucket: primary?.metadata?.bucketName || 'files',
    mime: primary?.metadata?.mimeType || null,
    name: primary?.name || null
  };
}

export async function getById(id, userId, userRole, userPermissions) {
  const revision = await repository.findById(id);
  if (!revision) throw createError({ statusCode: 404, message: 'Entity revision not found' });
  if (!canReadRevision(userPermissions, revision)) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  return toDTO(revision);
}

export async function list(userId, userOrg, userRole, userPermissions, filter = {}) {
  // The read scope mirrors the source records' list law: own-org rows
  // with system rows (no organization) admitted beside them.
  const activeOrgId = userPermissions?.organizationId?.toString?.() || null;
  const orgScope = activeOrgId
    ? { $or: [{ 'lineage.organizationId': toFlexibleId(activeOrgId) }, { 'lineage.organizationId': null }] }
    : {};
  const processed = { ...filter };
  if (processed.instanceId) {
    processed['data.source.id'] = toFlexibleId(processed.instanceId).toString();
    delete processed.instanceId;
  }
  if (processed.typeId) {
    processed['data.source.type'] = processed.typeId;
    delete processed.typeId;
  }
  if (processed.scope) {
    processed['data.scope'] = processed.scope;
    delete processed.scope;
  }

  const revisions = await repository.find({ ...orgScope, ...processed });
  return revisions.filter(revision => canReadRevision(userPermissions, revision)).map(toDTO);
}

export async function removeForEntity(typeId, instanceId) {
  return await repository.deleteForSource(typeId, instanceId);
}
