export const ACCESS_LEVELS = ['none', 'read', 'write', 'admin'];

export const ACTION_LEVELS = {
  view: 'read',
  read: 'read',
  view_all: 'read',
  view_contractors: 'read',
  create: 'write',
  edit: 'write',
  update: 'write',
  send: 'write',
  run: 'write',
  setPen: 'write',
  delete: 'admin',
  approve: 'admin',
  reject: 'admin',
  fulfill: 'admin',
  admin: 'admin'
};

export function actionToLevel(action, fallback = 'read') {
  return ACTION_LEVELS[action] || fallback;
}

export function hasPermissionGrant({
  permissions = {},
  feature,
  level = 'read',
  action = null,
  entity = null,
  entityType = null,
  transition = null
} = {}) {
  if (!feature) return false;
  const requiredLevel = action ? actionToLevel(action, level) : level;
  return normalizePermissionGrants(permissions[feature]).some(grant => grantAllows({
    grant,
    requiredLevel,
    action,
    entity,
    entityType,
    transition
  }));
}

export function normalizePermissionGrants(value) {
  if (!value || value === 'none') return [];
  if (typeof value === 'string') return [{ level: value }];
  if (Array.isArray(value)) return value.flatMap(normalizePermissionGrants);
  if (typeof value === 'object') return [{ ...value, level: value.level || value.access || 'none' }];
  return [];
}

export function levelAtLeast(actual, required) {
  const actualIndex = ACCESS_LEVELS.indexOf(actual || 'none');
  const requiredIndex = ACCESS_LEVELS.indexOf(required || 'read');
  return actualIndex >= 0 && requiredIndex >= 0 && actualIndex >= requiredIndex;
}

function grantAllows({ grant, requiredLevel, action, entity, entityType, transition }) {
  if (!grant || !levelAtLeast(grant.level, requiredLevel)) return false;
  if (action && grant.actions && grant.actions[action] !== true) return false;
  if (!scopeMatches(grant.scope || grant, entity, entityType)) return false;
  if (!transitionMatches(grant, transition)) return false;
  return true;
}

function scopeMatches(scope = {}, entity = null, entityType = null) {
  if (scope.entityType && entityType && scope.entityType !== entityType) return false;
  if (scope.entityTypes && entityType && !scope.entityTypes.includes(entityType)) return false;

  const lineage = entity?.lineage || {};
  const entityId = entity?._id || entity?.identity?.uid;
  return idScopeMatches(scope, 'organizationId', lineage.organizationId)
    && idScopeMatches(scope, 'projectId', lineage.projectId)
    && idScopeMatches(scope, 'queueId', lineage.queueId)
    && idScopeMatches(scope, 'warehouseId', lineage.warehouseId)
    && idScopeMatches(scope, 'entityId', entityId);
}

function idScopeMatches(scope, key, value) {
  const single = scope[key];
  const plural = scope[`${key}s`];
  if (!single && !Array.isArray(plural)) return true;
  const allowed = Array.isArray(plural) ? plural : [single];
  return allowed.map(String).includes(String(value || ''));
}

function transitionMatches(grant, transition = null) {
  const transitions = grant.transitions || grant.transition;
  if (!transitions || !transition) return true;
  const allowed = Array.isArray(transitions) ? transitions : [transitions];
  return allowed.some(item => {
    if (typeof item === 'string') {
      return item === transition.to || item === `${transition.from}->${transition.to}`;
    }
    return (!item.from || item.from === transition.from) && (!item.to || item.to === transition.to);
  });
}
