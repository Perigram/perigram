import crypto from 'node:crypto';
import * as repository from './repository.js';
import { createError } from 'h3';
import {
  createData,
  createEntityRef,
  createIdentity,
  createProvenance,
  createStatus
} from '../../core/blocks/index.js';
import { hasLineagePermission, getLineageFilter } from '../../utils/permissions.js';
import { toFlexibleId } from '../../utils/objectid.js';
import { pluralize } from '../../utils/strings.js';
import { EntityRevision } from './model.js';

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

function revisionIdentity(entityType, scope, number) {
  return createIdentity(`${entityType} ${scope} v${number}`);
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
    type: data.entityType,
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
  entityType,
  entity,
  scope = DEFAULT_SCOPE,
  content,
  snapshot,
  userId = 'SYSTEM',
  reason = 'content-change'
} = {}) {
  if (!entityType) throw createError({ statusCode: 400, message: 'Revision entityType is required' });
  if (!entity?._id) throw createError({ statusCode: 400, message: 'Revision entity is required' });
  if (!content) throw createError({ statusCode: 400, message: 'Revision content is required' });

  await repository.ensureIndexes();

  const entityId = toFlexibleId(entity._id);
  const contentHash = hashRevisionContent(content);
  const existing = await repository.findByHash(entityType, entityId, scope, contentHash);
  if (existing) return toDTO(existing);

  const latest = await repository.findLatest(entityType, entityId, scope);
  const number = Number(latest?.data?.number || 0) + 1;
  const origin = createStatus('ACTIVE', userId, { note: 'Entity revision created' });

  const doc = {
    identity: revisionIdentity(entityType, scope, number),
    origin,
    status: origin,
    lineage: {
      ...(entity.lineage || {}),
      [`${entityType}Id`]: entityId
    },
    data: createData({
      source: createEntityRef(entityType, entityId),
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
      return toDTO(await repository.findByHash(entityType, entityId, scope, contentHash));
    }
    throw error;
  }
}

export async function getCurrentForEntity(entityType, entityId, scope = DEFAULT_SCOPE) {
  return toDTO(await repository.findLatest(entityType, toFlexibleId(entityId), scope));
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
  if (processed.entityType) {
    processed['data.source.type'] = processed.entityType;
    delete processed.entityType;
  }
  if (processed.scope) {
    processed['data.scope'] = processed.scope;
    delete processed.scope;
  }

  const revisions = await repository.find({ ...lineageFilter, ...processed });
  return revisions.map(toDTO);
}
