import crypto from 'node:crypto';
import * as repository from './repository.js';
import { createError } from 'h3';
import {
  createData,
  createEntityRef,
  createProvenance,
  Identity
} from '../../core/blocks/index.js';
import { hasLineagePermission, getLineageFilter } from '../../utils/permissions.js';
import { toFlexibleId } from '../../utils/objectid.js';
import { pluralize } from '../../utils/strings.js';
import { EntityRevision } from './model.js';
import { statusService } from '../../core/machines/service.js';

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

export function revisionIdentity(typeId, entityId, scope, number) {
  const sourceId = toFlexibleId(entityId).toString();
  return new Identity(
    `revision:${typeId}:${sourceId}:${scope}:${number}`,
    `${typeId} ${scope} v${number}`
  );
}

function canReadRevision(userPermissions, revision) {
  if (!userPermissions) return true;
  const user = userPermissions;
  const lineage = revision?.lineage || {};
  const sourceFeature = pluralize(revision?.data?.source?.type || '');
  if (sourceFeature && hasLineagePermission(user, lineage, sourceFeature, 'read')) {
    return true;
  }
  return hasLineagePermission(user, lineage || {}, 'cassettes', 'read') ||
    hasLineagePermission(user, lineage || {}, 'projects', 'read');
}

export function derivedFromRevision(revision, parameters = {}) {
  const data = revision?.data || revision || {};
  const source = data.source || {
    type: data.typeId,
    id: data.entityId
  };
  return createProvenance(
    createEntityRef(source.type, source.id, revision?._id || data.revisionId || data.id),
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

  const entityId = toFlexibleId(entity._id);
  const contentHash = hashRevisionContent(content);
  const existing = await repository.findByHash(typeId, entityId, scope, contentHash);
  if (existing) return toDTO(existing);

  const latest = await repository.findLatest(typeId, entityId, scope);
  const number = Number(latest?.data?.number || 0) + 1;
  const origin = await statusService.initialStatusForOrganization(
    'entity_revision',
    entity.lineage?.organizationId,
    userId,
    { note: 'Entity revision created' }
  );

  const doc = {
    identity: revisionIdentity(typeId, entityId, scope, number),
    origin,
    status: origin,
    lineage: {
      ...(entity.lineage || {}),
      [`${typeId}Id`]: entityId
    },
    attachments,
    data: createData({
      source: createEntityRef(typeId, entityId),
      scope,
      number,
      contentHash,
      snapshot: snapshot || {
        identity: entity.identity || null,
        data: entity.data || {}
      },
      sourceStatus: entity.status || null,
      reason
    })
  };

  try {
    return toDTO(await repository.create(doc));
  } catch (error) {
    if (error?.code === 11000) {
      const concurrent = await repository.findByHash(typeId, entityId, scope, contentHash);
      if (concurrent) return toDTO(concurrent);
    }
    throw error;
  }
}

export async function getCurrentForEntity(typeId, entityId, scope = DEFAULT_SCOPE) {
  return toDTO(await repository.findLatest(typeId, toFlexibleId(entityId), scope));
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
  const lineageFilter = userPermissions?.memberships
    ? getLineageFilter(userPermissions)
    : {};
  const processed = { ...filter };
  if (processed.entityId) {
    processed['data.source.id'] = toFlexibleId(processed.entityId).toString();
    delete processed.entityId;
  }
  if (processed.typeId) {
    processed['data.source.type'] = processed.typeId;
    delete processed.typeId;
  }
  if (processed.scope) {
    processed['data.scope'] = processed.scope;
    delete processed.scope;
  }

  const revisions = await repository.find({ ...lineageFilter, ...processed });
  return revisions.filter(revision => canReadRevision(userPermissions, revision)).map(toDTO);
}

export async function removeForEntity(typeId, entityId) {
  return await repository.deleteForSource(typeId, entityId);
}
