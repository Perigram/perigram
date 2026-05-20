import { createError } from 'h3';
import { toFlexibleId } from '../../utils/objectid.js';

const LEVELS = ['none', 'read', 'write', 'admin'];

export function assertEntityAccess({ entity, entityType, feature = entityType, level = 'read', auth }) {
  if (!auth) throw createError({ statusCode: 401, message: 'Authentication required' });
  if (!hasEntityAccess({ entity, feature, level, auth })) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  return true;
}

export function assertOperationAccess({ operation, entities = {}, auth }) {
  if (!auth) throw createError({ statusCode: 401, message: 'Authentication required' });
  const access = operation?.access || {};
  if (auth.role === 'SYSTEM' && access.system === true) return true;

  const entityList = Object.values(entities).filter(Boolean);
  const lineageEntity = entityList.find(entity => entity?.lineage) || entityList[0];
  for (const requirement of access.permissions || []) {
    if (!hasEntityAccess({
      entity: lineageEntity,
      feature: requirement.feature,
      level: requirement.level || 'read',
      auth
    })) {
      throw createError({ statusCode: 403, message: `Permission denied for ${requirement.feature}:${requirement.level || 'read'}` });
    }
  }
  return true;
}

export function assertTransitionAccess({ transition, entity, auth }) {
  if (!auth) throw createError({ statusCode: 401, message: 'Authentication required' });
  const access = transition?.access || {};
  if (auth.role === 'SYSTEM' && access.system === true) return true;

  for (const requirement of access.permissions || []) {
    if (!hasEntityAccess({
      entity,
      feature: requirement.feature,
      level: requirement.level || 'read',
      auth
    })) {
      throw createError({ statusCode: 403, message: `Permission denied for ${requirement.feature}:${requirement.level || 'read'}` });
    }
  }
  return true;
}

export function createLineageFilter(auth) {
  const orgIds = (auth?.memberships || [])
    .map(membership => membership.organizationId ? toFlexibleId(membership.organizationId) : null)
    .filter(Boolean);
  return orgIds.length ? { 'lineage.organizationId': { $in: orgIds } } : { 'lineage.organizationId': { $in: [] } };
}

export function hasEntityAccess({ entity, feature, level = 'read', auth }) {
  if (!auth || !feature) return false;
  const requiredIndex = LEVELS.indexOf(level);
  if (requiredIndex === -1) return false;

  const orgId = entity?.lineage?.organizationId?.toString();
  const membership = orgId
    ? (auth.memberships || []).find(item => item.organizationId?.toString() === orgId)
    : (auth.memberships || [])[0];
  const permissions = membership?.permissions || auth.permissions || {};
  const actualIndex = LEVELS.indexOf(permissions[feature] || 'none');
  return actualIndex >= requiredIndex;
}
