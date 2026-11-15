import { createError } from 'h3';
import { toFlexibleId } from '../../utils/objectid.js';
import { actionToLevel, hasPermissionGrant, resolveEffectivePermissions } from '#shared/access-control.js';
import { isPublicReadEntity } from '#shared/public-entities.js';

export function assertEntityAccess({ entity, typeId, feature = typeId, level = 'read', action = null, auth }) {
  if (!auth) throw createError({ statusCode: 401, message: 'Authentication required' });
  if (!hasInstanceAccess({ entity, feature, level, action, auth, typeId })) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  return true;
}

export function assertCommandAccess({ command, action = command, entities = {}, auth }) {
  if (!auth) throw createError({ statusCode: 401, message: 'Authentication required' });
  const access = action?.access || {};
  if (isSystemAuth(auth) && access.system === true) return true;

  const entityList = Object.values(entities).filter(Boolean);
  // Entity refs are resolved before command execution; even commands with no
  // feature-specific permission clauses must not operate on another tenant's
  // records merely because the caller supplied their id.
  for (const entity of entityList) assertEntityOrganizationScope(entity, auth);
  const lineageEntity = entityList.find(entity => entity?.lineage) || entityList[0];
  for (const requirement of access.permissions || []) {
    if (!hasInstanceAccess({
      entity: lineageEntity,
      feature: requirement.feature,
      level: requirement.level || 'read',
      auth,
      typeId: requirement.typeId,
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
  // Every lifecycle transition is a write. Organization-less system rows
  // remain read-only to ordinary members, even when their feature grant is
  // broad; only the system actor may cross this boundary.
  assertEntityOrganizationScope(entity, auth, { required: processRoleIds.length > 0 || !isSystemAuth(auth) });
  if (processRoleIds.length) {
    const assignedRoleIds = auth.roleAssignments?.roleIds || [];
    const hasRequiredRole = assignedRoleIds.some(roleId => processRoleIds.includes(roleId));
    if (!hasRequiredRole) {
      throw createError({ statusCode: 403, message: 'Permission denied for process transition role' });
    }
    return true;
  }

  for (const requirement of access.permissions || []) {
    if (!hasInstanceAccess({
      entity,
      feature: requirement.feature,
      level: requirement.level || 'read',
      auth,
      typeId: requirement.typeId,
      transition
    })) {
      throw createError({ statusCode: 403, message: `Permission denied for ${requirement.feature}:${requirement.level || 'read'}` });
    }
  }

  // System-only execution (deadline edges, SPEC §7): `system: true` with
  // no role or permission grants names the system actor alone.
  if (access.system === true && !(access.permissions || []).length) {
    throw createError({ statusCode: 403, message: 'Permission denied for system-only transition' });
  }
  return true;
}

function assertEntityOrganizationScope(entity = {}, auth = {}, { required = false } = {}) {
  const organizationId = (entity?.organizationId ?? entity?.lineage?.organizationId ?? entity?.origin?.organizationId)?.toString();
  if (!organizationId) {
    if (required) throw createError({ statusCode: 403, message: 'Permission denied: organization scope required' });
    return true;
  }

  const activeOrganizationId = auth.organizationId?.toString();
  if (activeOrganizationId && activeOrganizationId !== organizationId) {
    throw createError({ statusCode: 403, message: 'Permission denied for organization scope' });
  }
  if (!activeOrganizationId && !(auth.memberships || []).some(item => item.organizationId?.toString() === organizationId)) {
    throw createError({ statusCode: 403, message: 'Permission denied for organization scope' });
  }
  return true;
}

export function createLineageFilter(auth) {
  if (auth?.organizationId) {
    return { 'lineage.organizationId': toFlexibleId(auth.organizationId) };
  }
  const orgIds = (auth?.memberships || [])
    .map(membership => membership.organizationId ? toFlexibleId(membership.organizationId) : null)
    .filter(Boolean);
  return orgIds.length ? { 'lineage.organizationId': { $in: orgIds } } : { 'lineage.organizationId': { $in: [] } };
}

export function hasInstanceAccess({ entity, feature, level = 'read', action = null, auth, typeId = null, transition = null, context = {} }) {
  if (!feature) return false;
  const requiredLevel = action ? actionToLevel(action, level) : level;
  if (requiredLevel === 'read' && isPublicReadEntity({ entity, typeId, feature })) return true;
  if (!auth) return false;

  // Tenant ownership can travel top-level on the §3 DTO, inside legacy
  // lineage, or on imported/origin-linked records. Apply the same precedence
  // as assertEntityOrganizationScope so permission grants cannot bypass the
  // origin organization boundary.
  const orgId = (entity?.organizationId ?? entity?.lineage?.organizationId ?? entity?.origin?.organizationId)?.toString();
  // System catalogue rows (organizationId: null) are shared read surfaces,
  // never organization write targets. Seed/admin maintenance uses the
  // explicit system actor; an org grant cannot turn a global row writable.
  if (!orgId && requiredLevel !== 'read' && !isSystemAuth(auth)) return false;
  const activeOrgId = auth.organizationId?.toString();
  if (orgId && activeOrgId && orgId !== activeOrgId) return false;
  if (orgId && !activeOrgId && !(auth.memberships || []).some(item => item.organizationId?.toString() === orgId)) return false;
  const membership = orgId
    ? (auth.memberships || []).find(item => item.organizationId?.toString() === orgId)
    : (auth.memberships || [])[0];
  const permissions = getEffectivePermissions(auth, membership);
  return hasPermissionGrant({ permissions, feature, level, action, entity, typeId, transition, context });
}

export function getEffectivePermissions(auth = {}, membership = null) {
  return resolveEffectivePermissions(auth, membership) || {};
}

function isSystemAuth(auth = {}) {
  return auth.system === true || auth.userId === 'SYSTEM';
}
