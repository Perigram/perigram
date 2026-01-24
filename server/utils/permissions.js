import { createError } from 'h3';
import { hasPermission } from './auth-helpers.js';
import { ObjectId } from 'mongodb';

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

// Organization filtering for multi-tenant queries using lineage
export function getLineageFilter(user) {
  if (user.role === 'SuperAdmin') return {};
  
  // Get all org IDs where user has membership
  const orgIds = (user.memberships || [])
    .map(m => new ObjectId(m.organizationId));
    
  return { 'lineage.organizationId': { $in: orgIds } };
}

// Legacy support - to be phased out
export function getOrgFilter(user) {
  if (user.role === 'SuperAdmin') return {};
  return { organizationId: new ObjectId(user.organizationId) };
}

// Check if user can access specific entity via lineage
export function checkEntityAccess(user, entity) {
  if (user.role === 'SuperAdmin') return true;
  
  const entityOrgId = entity.lineage?.organizationId?.toString() || entity.organizationId?.toString();
  if (!entityOrgId) return false;
  
  return (user.memberships || []).some(m => m.organizationId?.toString() === entityOrgId);
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