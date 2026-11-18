// Action-kind predicates over the projected manifest vocabulary
// (`createInstance`/`updateInstance`/`deleteInstance`/`link`/`unlink`/
// `runCommand`). One home for kind questions — legacy surfaces never
// branch on raw `actionKind` strings themselves.
const CREATE_KINDS = new Set(['createInstance']);
const UPDATE_KINDS = new Set(['updateInstance']);
const DELETE_KINDS = new Set(['deleteInstance']);
const DETAIL_TEMPLATES = new Set(['instanceDetail']);

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
  return action?.actionKind === 'link';
}

export function isRelationUnlinkAction(action = {}) {
  return action?.actionKind === 'unlink';
}

export function isDetailScreenTemplate(template = '') {
  return DETAIL_TEMPLATES.has(template);
}

export function actionAppliesToEntity(action = {}, entity = {}, typeId = '') {
  if (!action || !entity) return false;
  if (isCreateAction(action)) {
    const parentType = action.parentTypeId || '';
    if (!parentType || parentType !== typeId) return false;
    const fromStatus = action.state?.from || '';
    if (fromStatus && entityPrimaryStatus(entity) !== fromStatus) return false;
    return true;
  }
  if (action.typeId && typeId && action.typeId !== typeId) return false;
  const fromStatus = action.state?.from || '';
  if (fromStatus && entityPrimaryStatus(entity) !== fromStatus) return false;
  const currentStatus = entityPrimaryStatus(entity);
  const toStatus = action.state?.to || '';
  if (toStatus && currentStatus && toStatus === currentStatus && fromStatus !== currentStatus) return false;
  return true;
}

export function resolveGeneratedEntityActions({
  actionIds = [],
  actionManifest = [],
  entity = {},
  typeId = '',
  excludedActionIds = []
} = {}) {
  const excluded = new Set(excludedActionIds);
  return actionIds
    .filter(actionId => !excluded.has(actionId))
    .map(actionId => actionManifest.find(action => action.id === actionId))
    .filter(Boolean)
    .filter(action => actionAppliesToEntity(action, entity, typeId));
}

export function resolveScopedGeneratedActions({ actionIds = [], actionManifest = [] } = {}) {
  return actionIds
    .map(actionId => actionManifest.find(action => action.id === actionId))
    .filter(Boolean);
}

// Compiled create actions by target type id, contract order kept: the
// grouped map every create-dialog host (and its nested pickers) feeds on.
export function createActionsByType(actions = {}) {
  const grouped = {};
  for (const action of Object.values(actions || {})) {
    if (!isCreateAction(action) || action.__command || !action.typeId) continue;
    (grouped[action.typeId] ||= []).push(action);
  }
  return grouped;
}

export function isGeneratedSurfaceAction(action = {}) {
  if (isRelationUnlinkAction(action)) return false;
  if (isDeleteAction(action) && (action.trigger?.mode || 'manual') !== 'manual') return false;
  return [...CREATE_KINDS, ...UPDATE_KINDS, ...DELETE_KINDS, 'runCommand', 'link'].includes(action?.actionKind);
}

export function parentBoundCreateAppliesToTypeId(action = {}, typeId = '') {
  if (!action || !isCreateAction(action) || !typeId) return false;
  return (action.parentTypeId || '') === typeId;
}

export function entityPrimaryStatus(entity = {}) {
  // The wire DTO's primary state is the flat `state` string (SPEC §7/§3);
  // the `states` axis map and the legacy status block are older shapes.
  if (typeof entity.state === 'string' && entity.state) return entity.state;
  return entity.states?.main || entityPrimaryStatusOfLegacyBlock(entity) || '';
}

function entityPrimaryStatusOfLegacyBlock(entity = {}) {
  const state = entity.status?.state;
  if (typeof state === 'string') return state;
  return state?.primary || state?.active?.main || '';
}
