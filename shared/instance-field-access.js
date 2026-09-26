import {
  ACCESS_LEVELS,
  hasPermissionGrant,
  levelAtLeast
} from '#shared/access-control.js';
import {
  getEntityFieldAccessPolicy,
  normalizeFieldAccessTypeId
} from './field-access-policies.js';
import { isPublicReadEntity } from './public-entities.js';

const POLICY_LEVELS = ['read', 'write', 'admin'];

export function getActivePermissionsFromAuth(auth = {}, entity = null) {
  if (!auth) return {};
  if (auth.effectivePermissions) return auth.effectivePermissions;
  if (auth.permissions) return auth.permissions;

  const entityOrgId = entity?.lineage?.organizationId?.toString?.() || entity?.lineage?.organizationId;
  const activeOrgId = entityOrgId || auth.organizationId?.toString?.() || auth.organizationId;
  const membership = activeOrgId
    ? (auth.memberships || []).find(item => item.organizationId?.toString?.() === activeOrgId.toString())
    : (auth.memberships || [])[0];

  return membership?.permissions || auth.data?.permissions || {};
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

  const policy = findEntityFieldPolicy(typeId, requestedPath, auth);
  if (!policy) return false;

  const activePermissions = auth
    ? getActivePermissionsFromAuth(auth, entity)
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
    ? getActivePermissionsFromAuth(auth, entity)
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

export function hasFieldPolicyLevel(typeId, path, level = 'read') {
  const policy = findEntityFieldPolicy(typeId, path);
  return Boolean(policy && levelAtLeast(policy.level, level));
}
