// Action-kind predicates accept both manifest vocabularies: the projected
// UI contract (`createInstance`/`updateInstance`/`deleteInstance`/`link`)
// and the legacy exposure kinds (`createEntity`/…) that compiled before the
// cutover. One home per kind question — legacy surfaces never branch on raw
// `actionKind` strings themselves.
const CREATE_KINDS = new Set(['createEntity', 'createInstance']);
const UPDATE_KINDS = new Set(['updateEntity', 'updateInstance']);
const DELETE_KINDS = new Set(['deleteEntity', 'deleteInstance']);
const DETAIL_TEMPLATES = new Set(['entityDetail', 'instanceDetail']);

export function isCreateAction(action = {}) {
  return CREATE_KINDS.has(action?.actionKind);
}

export function isUpdateAction(action = {}) {
  return UPDATE_KINDS.has(action?.actionKind);
}

export function isDeleteAction(action = {}) {
  return DELETE_KINDS.has(action?.actionKind);
}

export function isRelationLinkAction(action = {}) {
  return action?.relationMutation?.operation === 'link' || action?.actionKind === 'link';
}

export function isRelationUnlinkAction(action = {}) {
  return action?.relationMutation?.operation === 'unlink' || action?.actionKind === 'unlink';
}

export function isDetailScreenTemplate(template = '') {
  return DETAIL_TEMPLATES.has(template);
}

function actionTypeOf(action = {}) {
  return action.entityType
    || action.typeId
    || action.inputs?.find(input => input.entityType)?.entityType
    || '';
}

export function actionAppliesToEntity(action = {}, entity = {}, entityType = '') {
  if (!action || !entity) return false;
  if (isCreateAction(action)) {
    const parentType = action.parentEntityType || action.inputs?.find(input => input.id === 'parent')?.entityType || '';
    if (!parentType || parentType !== entityType) return false;
    const fromStatus = action.status?.from || action.access?.statusFrom || '';
    if (fromStatus && entityPrimaryStatus(entity) !== fromStatus) return false;
    return true;
  }
  const actionEntityType = actionTypeOf(action);
  if (actionEntityType && entityType && actionEntityType !== entityType) return false;
  const fromStatus = action.status?.from || action.access?.statusFrom || '';
  if (fromStatus && entityPrimaryStatus(entity) !== fromStatus) return false;
  return true;
}

export function resolveGeneratedEntityActions({
  actionIds = [],
  actionManifest = [],
  entity = {},
  entityType = '',
  excludedActionIds = []
} = {}) {
  const excluded = new Set(excludedActionIds);
  return actionIds
    .filter(actionId => !excluded.has(actionId))
    .map(actionId => actionManifest.find(action => (action.actionId ?? action.id) === actionId))
    .filter(Boolean)
    .filter(action => actionAppliesToEntity(action, entity, entityType));
}

export function resolveScopedGeneratedActions({ actionIds = [], actionManifest = [] } = {}) {
  return actionIds
    .map(actionId => actionManifest.find(action => (action.actionId ?? action.id) === actionId))
    .filter(Boolean);
}

export function isGeneratedSurfaceAction(action = {}) {
  if (isRelationUnlinkAction(action)) return false;
  if (isDeleteAction(action) && (action.trigger?.mode || 'manual') !== 'manual') return false;
  return [
    ...CREATE_KINDS, ...UPDATE_KINDS, ...DELETE_KINDS,
    'archiveEntity', 'runCommand', 'sendToOrganization', 'link'
  ].includes(action?.actionKind);
}

export function parentBoundCreateAppliesToEntityType(action = {}, entityType = '') {
  if (!action || !isCreateAction(action) || !entityType) return false;
  const parentType = action.parentEntityType || action.inputs?.find(input => input.id === 'parent')?.entityType || '';
  return parentType === entityType;
}

export function entityPrimaryStatus(entity = {}) {
  const state = entity.status?.state;
  if (typeof state === 'string') return state;
  return state?.primary || state?.active?.main || '';
}
