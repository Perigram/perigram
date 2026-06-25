export function mergeCollectionActionContext({ incoming = {}, region = {}, source = {}, entityType = '', items = [] } = {}) {
  const hasOpenedParent = Boolean(incoming.parentEntityType && (entityIdentifier(incoming.parentEntity) || incoming.parentEntityId));
  const collectionParent = {
    parentEntityType: entityType,
    parentEntity: null,
    parentEntityId: '',
    parentOptions: items.map(entity => ({
      label: entity.identity?.name || entity.identity?.uid || entity._id,
      value: entityIdentifier(entity),
      entity
    }))
  };
  const openedParent = {
    parentEntityType: incoming.parentEntityType,
    parentEntity: incoming.parentEntity || null,
    parentEntityId: incoming.parentEntityId || entityIdentifier(incoming.parentEntity),
    parentOptions: incoming.parentOptions || []
  };
  return {
    ...incoming,
    region,
    source,
    entityType,
    ...(hasOpenedParent ? openedParent : collectionParent)
  };
}

export function resolveGeneratedActionEntities({ action = {}, entity = null, context = {}, screen = {} } = {}) {
  const resolvedContext = context?.value || context || {};
  const entities = {};
  const entityId = entityIdentifier(entity);
  const parentType = action.parentEntityType || action.inputs?.find(input => input.id === 'parent')?.entityType || '';
  const entityType = entity?.origin?.type || entity?.type || resolvedContext?.entityType || parentType || '';
  if (entityId && entityType) entities[entityType] = entityId;

  const contextParentId = parentType && resolvedContext.parentEntityType === parentType
    ? entityIdentifier(resolvedContext.parentEntity) || resolvedContext.parentEntityId
    : '';
  const parentId = parentType
    ? contextParentId || scopedParentId(parentType, screen) || resolveParentIdFromFilters(parentType, resolvedContext?.source?.filters, screen)
    : '';
  if (parentType && parentId) entities[parentType] = parentId;
  return entities;
}

export function generatedActionRequiresParent({ action = {}, entity = null, context = {}, screen = {} } = {}) {
  const parentType = action?.parentEntityType || action?.inputs?.find(input => input.id === 'parent')?.entityType || '';
  if (!parentType) return '';
  if (entityIdentifier(entity)) return '';
  const resolvedContext = context?.value || context || {};
  if (resolvedContext.parentEntityType === parentType && (entityIdentifier(resolvedContext.parentEntity) || resolvedContext.parentEntityId)) return '';
  if (scopedParentId(parentType, screen) || resolveParentIdFromFilters(parentType, resolvedContext?.source?.filters, screen)) return '';
  return parentType;
}

export function entityIdentifier(entity = null) {
  return entity?._id || entity?.identity?.uid || entity?.id || '';
}

function scopedParentId(parentType = '', screen = {}) {
  return screen.scope?.[`${parentType}Id`]
    || (screen.entityType === parentType ? screen.scope?.entityId : '')
    || '';
}

function resolveParentIdFromFilters(parentType = '', filters = {}, screen = {}) {
  const value = filters?.[`${parentType}Id`];
  if (typeof value === 'string' && value.startsWith('$screen.')) {
    return String(value).slice('$screen.'.length).split('.').filter(Boolean).reduce((item, key) => item?.[key], screen);
  }
  return value || '';
}
