export function actionAppliesToEntity(action = {}, entity = {}, entityType = '') {
  if (!action || !entity) return false;
  if (action.actionKind === 'createEntity') {
    const parentType = action.parentEntityType || action.inputs?.find(input => input.id === 'parent')?.entityType || '';
    if (!parentType || parentType !== entityType) return false;
    const fromStatus = action.status?.from || action.access?.statusFrom || '';
    if (fromStatus && entityPrimaryStatus(entity) !== fromStatus) return false;
    return true;
  }
  const actionEntityType = action.entityType || action.inputs?.find(input => input.entityType)?.entityType || '';
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
    .map(actionId => actionManifest.find(action => action.actionId === actionId))
    .filter(Boolean)
    .filter(action => actionAppliesToEntity(action, entity, entityType));
}

export function isGeneratedSurfaceAction(action = {}) {
  return action?.actionKind !== 'mutateEntity' || !action?.status?.to;
}

export function parentBoundCreateAppliesToEntityType(action = {}, entityType = '') {
  if (!action || action.actionKind !== 'createEntity' || !entityType) return false;
  const parentType = action.parentEntityType || action.inputs?.find(input => input.id === 'parent')?.entityType || '';
  return parentType === entityType;
}

export function entityPrimaryStatus(entity = {}) {
  const state = entity.status?.state;
  if (typeof state === 'string') return state;
  return state?.primary || state?.active?.main || '';
}
