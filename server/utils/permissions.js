import { createError } from 'h3';
import { hasPermission } from './auth-helpers.js';
import { toFlexibleId } from './objectid.js';

export function requireAuth(event) {
  if (!event.context.auth) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }
  return event.context.auth;
}

/**
 * Checks if user has permission for a specific entity based on its lineage
 * @param {Object} user - User from event.context.auth
 * @param {Object} lineage - The entity's lineage block
 * @param {string} entityType - e.g., 'projects', 'queues'
 * @param {string} level - 'read', 'write', 'admin'
 */
export function hasLineagePermission(user, lineage, entityType, level) {
  if (user.role === 'SuperAdmin') return true;
  
  const orgId = lineage.organizationId?.toString();
  if (!orgId) return false;

  // Find membership for this organization
  const membership = user.memberships?.find(m => m.organizationId?.toString() === orgId);
  if (!membership) return false;

  // Use the membership's permissions
  const permissions = membership.permissions || {};
  const userLevel = permissions[entityType] || 'none';
  
  const levels = ['none', 'read', 'write', 'admin'];
  const userLevelIndex = levels.indexOf(userLevel);
  const requiredLevelIndex = levels.indexOf(level);
  
  return userLevelIndex >= requiredLevelIndex;
}

export function requireLineagePermission(event, lineage, entityType, level) {
  const user = requireAuth(event);
  if (!hasLineagePermission(user, lineage, entityType, level)) {
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
  if (user?.role === 'SuperAdmin') return true;
  if (!entityOrgId) return false;
  const userOrgId = user?.organizationId || entity?.organizationId || entity?.lineage?.organizationId;
  return userOrgId?.toString() === entityOrgId?.toString();
}

// Organization filtering for multi-tenant queries using lineage
export function getLineageFilter(user) {
  if (user.role === 'SuperAdmin') return {};
  
  // Get all org IDs where user has membership
  const orgIds = (user.memberships || [])
    .map(m => m.organizationId ? toFlexibleId(m.organizationId) : null)
    .filter(Boolean);
    
  return { 'lineage.organizationId': { $in: orgIds } };
}

export function requireRole(event, ...allowedRoles) {
  requireAuth(event);
  
  const user = event.context.auth;
  if (!allowedRoles.includes(user.role)) {
    throw createError({ 
      statusCode: 403, 
      message: 'Insufficient privileges' 
    });
  }
}
