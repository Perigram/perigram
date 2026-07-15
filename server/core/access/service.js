import { createError } from 'h3';
import { actionToLevel, hasPermissionGrant } from '#shared/access-control.js';
import { isPublicReadEntity } from '#shared/public-entities.js';

export function assertEntityAccess({ entity, entityType, feature = entityType, level = 'read', action = null, auth }) {
  if (!auth) throw createError({ statusCode: 401, message: 'Authentication required' });
  if (!hasEntityAccess({ entity, feature, level, action, auth, entityType })) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  return true;
}

export function assertCommandAccess({ command, action = command, entities = {}, auth }) {
  if (!auth) throw createError({ statusCode: 401, message: 'Authentication required' });
  const access = action?.access || {};
  if (isSystemAuth(auth) && access.system === true) return true;

  const entityList = Object.values(entities).filter(Boolean);
  const lineageEntity = entityList.find(entity => entity?.lineage) || entityList[0];
  for (const requirement of access.permissions || []) {
    if (!hasEntityAccess({
      entity: lineageEntity,
      feature: requirement.feature,
      level: requirement.level || 'read',
      auth,
      entityType: requirement.entityType,
      context: { lineageEntities: entities }
    })) {
      throw createError({ statusCode: 403, message: `Permission denied for ${requirement.feature}:${requirement.level || 'read'}` });
    }
  }
  return true;
}

export function assertTransitionAccess({ transition, entity, auth }) {
  if (!auth) throw createError({ statusCode: 401, message: 'Authentication required' });
  const access = transition?.access || {};
  if (isSystemAuth(auth) && access.system === true) return true;

  const processRoleIds = access.processRoleIds || transition?.processRoleIds || [];
  if (processRoleIds.length) {
    const assignedRoleIds = auth.roleAssignments?.roleIds || [];
    const hasRequiredRole = assignedRoleIds.some(roleId => processRoleIds.includes(roleId));
    if (!hasRequiredRole) {
      throw createError({ statusCode: 403, message: 'Permission denied for process transition role' });
    }
    return true;
  }

  for (const requirement of access.permissions || []) {
    if (!hasEntityAccess({
      entity,
      feature: requirement.feature,
      level: requirement.level || 'read',
      auth,
      entityType: requirement.entityType,
      transition
    })) {
      throw createError({ statusCode: 403, message: `Permission denied for ${requirement.feature}:${requirement.level || 'read'}` });
    }
  }
  return true;
}

export function createLineageFilter(auth) {
  const orgIds = (auth?.memberships || [])
    .map(membership => membership.organizationId?.toString?.() || null)
    .filter(Boolean);
  return orgIds.length ? { 'lineage.organization.entityId': { $in: orgIds } } : { 'lineage.organization.entityId': { $in: [] } };
}

export function hasEntityAccess({ entity, feature, level = 'read', action = null, auth, entityType = null, transition = null, context = {} }) {
  if (!feature) return false;
  const requiredLevel = action ? actionToLevel(action, level) : level;
  if (requiredLevel === 'read' && isPublicReadEntity({ entity, entityType, feature })) return true;
  if (!auth) return false;

  const orgId = entity?.lineage?.organization?.entityId?.toString();
  const membership = orgId
    ? (auth.memberships || []).find(item => item.organizationId?.toString() === orgId)
    : (auth.memberships || [])[0];
  const permissions = getEffectivePermissions(auth, membership);
  return hasPermissionGrant({ permissions, feature, level, action, entity, entityType, transition, context });
}

export function getEffectivePermissions(auth = {}, membership = null) {
  return auth.effectivePermissions || membership?.permissions || auth.permissions || {};
}

function isSystemAuth(auth = {}) {
  return auth.system === true || auth.userId === 'SYSTEM';
}
