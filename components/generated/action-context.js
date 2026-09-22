export function mergeCollectionActionContext({ incoming = {}, region = {}, source = {}, typeId = '', items = [] } = {}) {
  const hasOpenedParent = Boolean(incoming.parentTypeId && (instanceIdentifier(incoming.parentEntity) || incoming.parentEntityId));
  const collectionParent = {
    parentTypeId: typeId,
    parentEntity: null,
    parentEntityId: '',
    parentOptions: items.map(entity => ({
      label: entity.identity?.name || entity.identity?.uid || entity._id,
      value: instanceIdentifier(entity),
      entity
    }))
  };
  const openedParent = {
    parentTypeId: incoming.parentTypeId,
    parentEntity: incoming.parentEntity || null,
    parentEntityId: incoming.parentEntityId || instanceIdentifier(incoming.parentEntity),
    parentOptions: incoming.parentOptions || []
  };
  return {
    ...incoming,
    region,
    source,
    typeId,
    ...(hasOpenedParent ? openedParent : collectionParent)
  };
}

export function resolveGeneratedActionEntities({ action = {}, entity = null, context = {}, screen = {} } = {}) {
  const resolvedContext = context?.value || context || {};
  const entities = {};
  const instanceId = instanceIdentifier(entity);
  const parentType = action.parentTypeId || '';
  const typeId = actionInputTypeId(action)
    || entity?.origin?.type
    || entity?.type
    || resolvedContext?.typeId
    || parentType
    || '';
  if (instanceId && typeId) entities[typeId] = instanceId;

  const contextParentId = parentType && resolvedContext.parentTypeId === parentType
    ? instanceIdentifier(resolvedContext.parentEntity) || resolvedContext.parentEntityId
    : '';
  const parentId = parentType
    ? contextParentId || scopedParentId(parentType, screen) || resolveParentIdFromFilters(parentType, resolvedContext?.source?.filters, screen)
    : '';
  if (parentType && parentId) entities[parentType] = parentId;
  return entities;
}

export function generatedActionRequiresParent({ action = {}, entity = null, context = {}, screen = {} } = {}) {
  const parentType = action?.parentTypeId || '';
  if (!parentType) return '';
  if (instanceIdentifier(entity)) return '';
  const resolvedContext = context?.value || context || {};
  if (resolvedContext.parentTypeId === parentType && (instanceIdentifier(resolvedContext.parentEntity) || resolvedContext.parentEntityId)) return '';
  if (scopedParentId(parentType, screen) || resolveParentIdFromFilters(parentType, resolvedContext?.source?.filters, screen)) return '';
  return parentType;
}

export function instanceIdentifier(entity = null) {
  return entity?._id || entity?.identity?.uid || entity?.id || '';
}

function actionInputTypeId(action = {}) {
  if (action.actionKind === 'createInstance') return '';
  return action.typeId
    || action.inputs?.find(input => input.id === 'entity' || (input.required && input.prompt !== true && input.typeId))?.typeId
    || '';
}

function scopedParentId(parentType = '', screen = {}) {
  return screen.scope?.[`${parentType}Id`]
    || (screen.typeId === parentType ? screen.scope?.instanceId : '')
    || '';
}

function resolveParentIdFromFilters(parentType = '', filters = {}, screen = {}) {
  const value = filters?.[`${parentType}Id`];
  if (typeof value === 'string' && value.startsWith('$screen.')) {
    return String(value).slice('$screen.'.length).split('.').filter(Boolean).reduce((item, key) => item?.[key], screen);
  }
  return value || '';
}
