import {
  ACCESS_LEVELS,
  hasPermissionGrant,
  resolveEffectivePermissions
} from '#shared/access-control.js';
import {
  getEntityFieldAccessPolicy,
  normalizeFieldAccessTypeId
} from './field-access-policies.js';
import { isPublicReadEntity } from './public-entities.js';

const POLICY_LEVELS = ['read', 'write', 'admin'];

// Legacy memberships without a status predate approval state and remain
// active; an explicit non-active status must never contribute field grants.
function isActiveMembership(membership = {}) {
  return !membership.status || membership.status === 'active';
}

export function getActivePermissionsFromAuth(auth = {}, entity = null, typeId = '') {
  if (!auth) return {};
  const rawEntityOrgId = entity?.organizationId
    ?? entity?.lineage?.organizationId
    ?? entity?.origin?.organizationId;
  const entityOrgId = rawEntityOrgId?.toString?.() || rawEntityOrgId || null;
  const activeOrgId = auth.organizationId?.toString?.() || auth.organizationId || null;
  const allMemberships = auth.memberships || [];
  const memberships = allMemberships.filter(isActiveMembership);
  // User records can belong to several organizations. For their field
  // projection, prefer the caller's active organization when the target
  // user is a member there; otherwise use the first shared membership.
  const targetUserOrgIds = normalizeFieldAccessTypeId(typeId) === 'user'
    ? new Set((entity?.data?.memberships || []).map(item =>
      item?.organizationId?.toString?.() || String(item?.organizationId || '')
    ))
    : null;
  const sharedUserMembership = targetUserOrgIds
    ? memberships.find(item => (
      (item?.organizationId?.toString?.() || String(item?.organizationId || '')) === activeOrgId
      && targetUserOrgIds.has(activeOrgId)
    )) || memberships.find(item =>
      targetUserOrgIds.has(item?.organizationId?.toString?.() || String(item?.organizationId || ''))
    )
    : null;
  const rawTargetOrgId = sharedUserMembership?.organizationId ?? entityOrgId ?? activeOrgId;
  const targetOrgId = rawTargetOrgId?.toString?.() || rawTargetOrgId || null;
  const membership = targetOrgId
    ? memberships.find(item => item.organizationId?.toString?.() === targetOrgId.toString())
    : memberships[0];
  const inactiveCallerMembership = targetOrgId && allMemberships.some(item => (
    item.organizationId?.toString?.() === targetOrgId.toString() && !isActiveMembership(item)
  ));
  if (inactiveCallerMembership) return {};

  // Effective permissions are compiled for the active organization. Never
  // reuse that projection when redacting an entity owned by another tenant:
  // use that tenant's own membership grant, or no grant at all.
  if (targetOrgId && targetOrgId !== activeOrgId) {
    return membership?.permissions || {};
  }

  return resolveEffectivePermissions(auth, membership) ?? auth.data?.permissions ?? {};
}

export function normalizeFieldDescriptor(field) {
  if (typeof field === 'string') return { path: field };
  return field || {};
}

export function fieldPathMatches(policyPath, requestedPath) {
  if (!policyPath || !requestedPath) return false;
  if (policyPath === requestedPath) return true;

  if (policyPath.endsWith('.*')) {
    const basePath = policyPath.slice(0, -2);
    return requestedPath === basePath || requestedPath.startsWith(`${basePath}.`);
  }

  return requestedPath.startsWith(`${policyPath}.`);
}

// Declaration-derived field access (Phase 6): the compiled type view's
// projected field policies for types with no legacy entry in the domain
// map. The registry store registers them from the served CTS client
// bundle — feature = the class-collection feature the server's own
// instance access engine gates reads on, so client display filtering and
// server read gating answer the same grant.
let declarationAccessByType = new Map();

export function registerDeclarationFieldAccess(entriesByType = {}) {
  declarationAccessByType = new Map(Object.entries(entriesByType || {}));
}

function declarationFieldPolicyFor(typeId = '') {
  return declarationAccessByType.get(String(typeId)) || null;
}

export function getInstanceFieldPolicyEntries(typeId) {
  const policy = getEntityFieldAccessPolicy(typeId) || declarationFieldPolicyFor(typeId);
  if (!policy) return [];

  return POLICY_LEVELS.flatMap(level =>
    (policy[level] || []).map(path => ({
      path,
      feature: policy.feature,
      level
    }))
  );
}

export function getActiveEntityFieldPolicyEntries(typeId, auth = null) {
  const baseEntries = getInstanceFieldPolicyEntries(typeId);
  const processPolicy = auth?.fieldPolicies?.[typeId];
  if (!processPolicy) return baseEntries;

  const baseFeature = baseEntries[0]?.feature || getEntityFieldAccessPolicy(typeId)?.feature || typeId;
  return [
    ...(processPolicy.read || []).map(path => ({ path, feature: baseFeature, level: 'read' })),
    ...(processPolicy.write || []).map(path => ({ path, feature: baseFeature, level: 'write' })),
    ...(processPolicy.private || []).map(path => ({ path, feature: baseFeature, level: 'admin' }))
  ];
}

export function findEntityFieldPolicy(typeId, path, auth = null) {
  const matches = getActiveEntityFieldPolicyEntries(typeId, auth)
    .filter(entry => fieldPathMatches(entry.path, path))
    .sort((a, b) => {
      const levelDelta = ACCESS_LEVELS.indexOf(a.level) - ACCESS_LEVELS.indexOf(b.level);
      if (levelDelta !== 0) return levelDelta;
      return b.path.length - a.path.length;
    });

  return matches[0] || null;
}

// Per-state narrowing (CTS SPEC §7 `fieldPolicy`, §10): the compiled
// per-state facets arrive on the auth context keyed by type and state
// value. The instance's state resolves the exact machine path first,
// then the leaf segment; an unrestricted facet or absent entry displays.
function stateVisibleAllows(statePolicies, typeId, entity, path) {
  const byValue = statePolicies?.[typeId];
  if (!byValue) return true;
  const state = String(entity?.state ?? '');
  if (!state) return true;
  const facet = byValue[state] || byValue[state.split('.').pop()];
  if (!facet || !Array.isArray(facet.visible)) return true;
  const fieldId = String(path || '').startsWith('fields.')
    ? String(path).slice('fields.'.length)
    : String(path || '');
  return facet.visible.includes(fieldId);
}

export function canDisplayEntityField({
  permissions = {},
  auth = null,
  entity = null,
  typeId,
  field = null,
  path = null
} = {}) {
  const descriptor = normalizeFieldDescriptor(field);
  const requestedPath = path || descriptor.path;
  if (!typeId || !requestedPath) return false;
  if (!stateVisibleAllows(auth?.stateFieldPolicies, typeId, entity, requestedPath)) return false;

  const policy = findEntityFieldPolicy(typeId, requestedPath, auth);
  if (!policy) return false;

  const activePermissions = auth
    ? getActivePermissionsFromAuth(auth, entity, typeId)
    : permissions;

  if ((descriptor.level || policy.level) === 'read' && isPublicReadEntity({
    entity,
    typeId: normalizeFieldAccessTypeId(typeId),
    feature: descriptor.feature || policy.feature
  })) return true;

  return hasPermissionGrant({
    permissions: activePermissions,
    feature: descriptor.feature || policy.feature,
    level: descriptor.level || policy.level,
    entity,
    typeId: normalizeFieldAccessTypeId(typeId)
  });
}

export function filterEntityFields({
  fields = [],
  permissions = {},
  auth = null,
  entity = null,
  typeId
} = {}) {
  return fields.filter(field => canDisplayEntityField({
    permissions,
    auth,
    entity,
    typeId,
    field
  }));
}

export function allowedEntityFieldPolicies({ typeId, permissions = {}, auth = null, entity = null } = {}) {
  const activePermissions = auth
    ? getActivePermissionsFromAuth(auth, entity, typeId)
    : permissions;

  return getActiveEntityFieldPolicyEntries(typeId, auth).filter(entry =>
    (entry.level === 'read' && isPublicReadEntity({
      entity,
      typeId: normalizeFieldAccessTypeId(typeId),
      feature: entry.feature
    })) || hasPermissionGrant({
      permissions: activePermissions,
      feature: entry.feature,
      level: entry.level,
      entity,
      typeId: normalizeFieldAccessTypeId(typeId)
    })
  );
}

export function redactEntityForAccess(entity, typeId, authOrPermissions = null) {
  if (!entity || !typeId || !authOrPermissions) return entity;

  const isAuthContext = authOrPermissions.memberships
    || authOrPermissions.permissions
    || authOrPermissions.effectivePermissions
    || authOrPermissions.organizationId;
  const permissions = isAuthContext
    ? getActivePermissionsFromAuth(authOrPermissions, entity)
    : authOrPermissions;

  const redacted = {};
  const policies = allowedEntityFieldPolicies({
    typeId,
    permissions,
    auth: isAuthContext ? authOrPermissions : null,
    entity
  });
  for (const policy of policies) {
    copyPolicyPath(entity, redacted, policy.path);
  }
  return redacted;
}

function copyPolicyPath(source, target, policyPath) {
  const sourcePath = policyPath.endsWith('.*') ? policyPath.slice(0, -2) : policyPath;
  copyAllowedPath(source, target, sourcePath.split('.').filter(Boolean));
}

function copyAllowedPath(source, target, segments) {
  if (!source || !target || !segments.length) return;
  const [segment, ...rest] = segments;
  const value = source[segment];
  if (value === undefined) return;

  if (!rest.length) {
    target[segment] = value;
    return;
  }

  if (Array.isArray(value)) {
    if (!Array.isArray(target[segment])) target[segment] = [];
    value.forEach((item, index) => {
      if (item === undefined || item === null) return;
      if (!target[segment][index] || typeof target[segment][index] !== 'object') target[segment][index] = {};
      copyAllowedPath(item, target[segment][index], rest);
    });
    return;
  }

  if (!target[segment] || typeof target[segment] !== 'object') target[segment] = {};
  copyAllowedPath(value, target[segment], rest);
}

