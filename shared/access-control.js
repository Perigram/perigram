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
  typeId = null,
  transition = null,
  context = {}
} = {}) {
  if (!feature) return false;
  const requiredLevel = action ? actionToLevel(action, level) : level;
  return normalizePermissionGrants(permissions[feature]).some(grant => grantAllows({
    grant,
    feature,
    requiredLevel,
    action,
    entity,
    typeId,
    transition,
    context
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

export function evaluateAccessRule({ rule, context = {} } = {}) {
  if (!rule) return true;
  if (Array.isArray(rule)) return rule.every(item => evaluateAccessRule({ rule: item, context }));
  if (typeof rule !== 'object') return Boolean(rule);

  if (Array.isArray(rule.all)) return rule.all.every(item => evaluateAccessRule({ rule: item, context }));
  if (Array.isArray(rule.any)) return rule.any.some(item => evaluateAccessRule({ rule: item, context }));
  if (rule.not) return !evaluateAccessRule({ rule: rule.not, context });

  const actual = resolveRuleFact(rule, context);
  if (rule.exists !== undefined) return Boolean(actual !== undefined && actual !== null && actual !== '') === Boolean(rule.exists);
  if (rule.equals !== undefined) return compareRuleValues(actual, rule.equals);
  if (rule.notEquals !== undefined) return !compareRuleValues(actual, rule.notEquals);
  if (rule.in !== undefined) {
    const allowed = Array.isArray(rule.in) ? rule.in : [rule.in];
    return allowed.some(value => compareRuleValues(actual, value));
  }
  if (rule.includes !== undefined) {
    const values = Array.isArray(actual) ? actual : [actual];
    return values.some(value => compareRuleValues(value, rule.includes));
  }
  if (rule.atLeast !== undefined) return levelAtLeast(actual, rule.atLeast);
  return false;
}

function grantAllows({ grant, feature, requiredLevel, action, entity, typeId, transition, context = {} }) {
  if (!grant || !levelAtLeast(grant.level, requiredLevel)) return false;
  if (action && grant.actions && grant.actions[action] !== true) return false;
  if (!scopeMatches(grant.scope || grant, entity, typeId)) return false;
  if (grant.scope && !lineageScopeMatches(grant.scope, entity)) return false;
  if (!transitionMatches(grant, transition)) return false;
  if (grant.rule && !evaluateAccessRule({
    rule: grant.rule,
    context: {
      ...context,
      grant,
      feature,
      requiredLevel,
      action,
      entity,
      typeId,
      transition
    }
  })) return false;
  return true;
}

function scopeMatches(scope = {}, entity = null, typeId = null) {
  if (scope.typeId && typeId && scope.typeId !== typeId) return false;
  if (scope.typeIds && typeId && !scope.typeIds.includes(typeId)) return false;

  const lineage = entity?.lineage || {};
  const instanceId = entity?._id || entity?.identity?.uid;
  return idScopeMatches(scope, 'organizationId', lineage.organizationId)
    && idScopeMatches(scope, 'instanceId', instanceId);
}

// Compiled grants scope by lineage keys beyond the reserved vocabulary
// (an action window or screen binding carries e.g. `warehouseId`): every
// non-reserved scope key names a lineage field the entity must carry.
const RESERVED_SCOPE_KEYS = new Set(['typeId', 'typeIds', 'organizationId', 'organizationIds', 'instanceId', 'instanceIds']);

function lineageScopeMatches(scope = {}, entity = null) {
  const lineage = entity?.lineage || {};
  for (const [key, constraint] of Object.entries(scope)) {
    if (RESERVED_SCOPE_KEYS.has(key)) continue;
    const allowed = Array.isArray(constraint) ? constraint : [constraint];
    if (!allowed.map(String).includes(String(lineage[key] || ''))) return false;
  }
  return true;
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

function resolveRuleFact(rule, context) {
  const fact = rule.fact || rule.path;
  if (!fact) return undefined;
  if (fact === 'feature') return context.feature;
  if (fact === 'level') return context.grant?.level;
  if (fact === 'requiredLevel') return context.requiredLevel;
  if (fact === 'action') return context.action;
  if (fact === 'typeId') return context.typeId;
  if (fact === 'instanceId') return context.entity?._id || context.entity?.identity?.uid;
  if (fact === 'primaryState' || fact === 'primaryStatus' || fact === 'status.primary') return getPrimaryStatus(context.entity?.states) || getPrimaryStatus(context.entity?.status);
  if (fact === 'transition.from') return context.transition?.from;
  if (fact === 'transition.to') return context.transition?.to;
  if (fact === 'transition.region') return context.transition?.region;
  if (fact.startsWith('lineage.')) return resolveLineageFact(fact.slice('lineage.'.length), context);
  if (fact === 'field') return getByPath(context.entity, rule.field || rule.entityPath || '');
  if (fact.startsWith('entity.')) return getByPath(context.entity, fact.slice('entity.'.length));
  if (fact.startsWith('context.')) return getByPath(context, fact.slice('context.'.length));
  return getByPath(context, fact);
}

function resolveLineageFact(path, context) {
  if (!path || path.endsWith('Id')) return getByPath(context.entity?.lineage, path);
  const [type, ...rest] = path.split('.');
  if (!type || rest.length === 0) return getByPath(context.entity?.lineage, path);

  const lineageEntity = context.lineageEntities?.[type]
    || context.entity?.lineageEntities?.[type]
    || context.entity?.lineage?.[type];
  const traitPath = rest.join('.');

  if (traitPath === 'id') return lineageEntity?._id || lineageEntity?.identity?.uid || context.entity?.lineage?.[`${type}Id`];
  if (traitPath === 'type') return lineageEntity?.type || lineageEntity?.typeId || lineageEntity?.origin?.type || lineageEntity?.data?.type;
  if (traitPath === 'status.primary') return getPrimaryStatus(lineageEntity?.states) || getPrimaryStatus(lineageEntity?.status);
  return getByPath(lineageEntity, traitPath);
}

function getPrimaryStatus(status) {
  if (typeof status === 'string') return status;
  // Instance documents carry one flat `state` string (SPEC §3/§7); the
  // legacy v24 Status block resolves to its primary either way.
  if (typeof status?.main === 'string') return status.main;
  if (typeof status?.state === 'string') return status.state;
  return status?.primary ?? status?.state?.primary ?? Object.values(status?.active || {}).find(Boolean);
}

function compareRuleValues(left, right) {
  if (Array.isArray(left)) return left.some(item => compareRuleValues(item, right));
  if (Array.isArray(right)) return right.some(item => compareRuleValues(left, item));
  return String(left ?? '') === String(right ?? '');
}

function getByPath(source, path) {
  if (!source || !path) return undefined;
  return String(path).split('.').filter(Boolean).reduce((value, key) => value?.[key], source);
}
