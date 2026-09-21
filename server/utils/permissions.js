import { createError } from 'h3';
import { hasPermission } from './auth-helpers.js';
import { createLineageFilter, hasEntityAccess } from '../core/access/service.js';

export function requireAuth(event) {
  if (!event.context.auth) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }
  return event.context.auth;
}

/**
 * Checks if user has permission for a specific entity based on its lineage
 * @param {Object} user - User from event.context.auth
 * @param {Object} lineageOrEntity - The entity DTO/model or its lineage block
 * @param {string} typeId - e.g., 'projects', 'queues'
 * @param {string} level - 'read', 'write', 'admin'
 */
export function hasLineagePermission(user, lineageOrEntity, typeId, level, options = {}) {
  const entity = lineageOrEntity?.lineage
    ? lineageOrEntity
    : { lineage: lineageOrEntity || {} };
  return hasEntityAccess({ entity, feature: typeId, level, action: options.action || null, auth: user });
}

export function requireLineagePermission(event, lineageOrEntity, typeId, level) {
  const user = requireAuth(event);
  if (!hasLineagePermission(user, lineageOrEntity, typeId, level)) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  return user;
}

export function requirePermission(event, entity, level) {
  const user = requireAuth(event);
  
  if (!hasPermission(user, entity, level)) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  return user;
}

// Legacy organization-level access helper retained for older tests/callers.
// New v24 services should prefer hasLineagePermission().
export function checkEntityAccess(user, entity, entityOrgId) {
  if (!entityOrgId) return false;
  const userOrgId = user?.organizationId || entity?.organizationId || entity?.lineage?.organizationId;
  return userOrgId?.toString() === entityOrgId?.toString();
}

// Organization filtering for multi-tenant queries using lineage
export function getLineageFilter(user) {
  return createLineageFilter(user);
}
