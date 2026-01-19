import { createError } from 'h3';
import { hasPermission } from './auth-helpers.js';
import { ObjectId } from 'mongodb';

export function requireAuth(event) {
  if (!event.context.auth) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }
  return event.context.auth;
}

export function requirePermission(event, entity, level) {
  const user = requireAuth(event);
  
  if (!hasPermission(user, entity, level)) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  return user;
}

// Organization filtering for multi-tenant queries
export function getOrgFilter(user) {
  // SuperAdmin sees everything
  if (user.role === 'SuperAdmin') {
    return {};
  }
  
  // Others see only their organization
  return { organizationId: new ObjectId(user.organizationId) };
}

// Check if user can access specific entity
export function checkEntityAccess(user, entity, entityOrgId) {
  // SuperAdmin can access anything
  if (user.role === 'SuperAdmin') return true;
  
  // Others must match organization
  if (!entityOrgId) return false;
  return entityOrgId.toString() === user.organizationId.toString();
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