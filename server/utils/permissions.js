import { createError } from 'h3';
import { createLineageFilter, hasInstanceAccess } from '../core/access/service.js';

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
  return hasInstanceAccess({ entity, feature: typeId, level, action: options.action || null, auth: user });
}

export function requireLineagePermission(event, lineageOrEntity, typeId, level) {
  const user = requireAuth(event);
  if (!hasLineagePermission(user, lineageOrEntity, typeId, level)) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  return user;
}

// Organization filtering for multi-tenant queries using lineage
export function getLineageFilter(user) {
  return createLineageFilter(user);
}
