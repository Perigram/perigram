import {
  ACCESS_LEVELS,
  hasPermissionGrant,
  levelAtLeast
} from '#shared/access-control.js';
import {
  getEntityFieldAccessPolicy,
  normalizeFieldAccessEntityType
} from '@cutkit/domain-cnc';

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

export function getEntityFieldPolicyEntries(entityType) {
  const policy = getEntityFieldAccessPolicy(entityType);
  if (!policy) return [];

  return POLICY_LEVELS.flatMap(level =>
    (policy[level] || []).map(path => ({
      path,
      feature: policy.feature,
      level
    }))
  );
}

export function getActiveEntityFieldPolicyEntries(entityType, auth = null) {
  const baseEntries = getEntityFieldPolicyEntries(entityType);
  const processPolicy = auth?.fieldPolicies?.[entityType];
  if (!processPolicy) return baseEntries;

  const baseFeature = baseEntries[0]?.feature || getEntityFieldAccessPolicy(entityType)?.feature || entityType;
  return [
    ...(processPolicy.read || []).map(path => ({ path, feature: baseFeature, level: 'read' })),
    ...(processPolicy.write || []).map(path => ({ path, feature: baseFeature, level: 'write' })),
    ...(processPolicy.private || []).map(path => ({ path, feature: baseFeature, level: 'admin' }))
  ];
}

export function findEntityFieldPolicy(entityType, path, auth = null) {
  const matches = getActiveEntityFieldPolicyEntries(entityType, auth)
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
  entityType,
  field = null,
  path = null
} = {}) {
  const descriptor = normalizeFieldDescriptor(field);
  const requestedPath = path || descriptor.path;
  if (!entityType || !requestedPath) return false;

  const policy = findEntityFieldPolicy(entityType, requestedPath, auth);
  if (!policy) return false;

  const activePermissions = auth
    ? getActivePermissionsFromAuth(auth, entity)
    : permissions;

  return hasPermissionGrant({
    permissions: activePermissions,
    feature: descriptor.feature || policy.feature,
    level: descriptor.level || policy.level,
    entity,
    entityType: normalizeFieldAccessEntityType(entityType)
  });
}

export function filterEntityFields({
  fields = [],
  permissions = {},
  auth = null,
  entity = null,
  entityType
} = {}) {
  return fields.filter(field => canDisplayEntityField({
    permissions,
    auth,
    entity,
    entityType,
    field
  }));
}

export function allowedEntityFieldPolicies({ entityType, permissions = {}, auth = null, entity = null } = {}) {
  const activePermissions = auth
    ? getActivePermissionsFromAuth(auth, entity)
    : permissions;

  return getActiveEntityFieldPolicyEntries(entityType, auth).filter(entry =>
    hasPermissionGrant({
      permissions: activePermissions,
      feature: entry.feature,
      level: entry.level,
      entity,
      entityType: normalizeFieldAccessEntityType(entityType)
    })
  );
}

export function redactEntityForAccess(entity, entityType, authOrPermissions = null) {
  if (!entity || !entityType || !authOrPermissions) return entity;

  const isAuthContext = authOrPermissions.memberships
    || authOrPermissions.permissions
    || authOrPermissions.effectivePermissions
    || authOrPermissions.organizationId;
  const permissions = isAuthContext
    ? getActivePermissionsFromAuth(authOrPermissions, entity)
    : authOrPermissions;

  const redacted = {};
  const policies = allowedEntityFieldPolicies({
    entityType,
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
  const value = getValueAtPath(source, sourcePath);
  if (value === undefined) return;
  setValueAtPath(target, sourcePath, value);
}

function getValueAtPath(source, path) {
  if (!path) return undefined;
  return path.split('.').reduce((current, segment) => current?.[segment], source);
}

function setValueAtPath(target, path, value) {
  const segments = path.split('.');
  const last = segments.pop();
  const parent = segments.reduce((current, segment) => {
    if (!current[segment] || typeof current[segment] !== 'object') current[segment] = {};
    return current[segment];
  }, target);
  parent[last] = value;
}

export function hasFieldPolicyLevel(entityType, path, level = 'read') {
  const policy = findEntityFieldPolicy(entityType, path);
  return Boolean(policy && levelAtLeast(policy.level, level));
}
