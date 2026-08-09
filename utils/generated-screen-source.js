export function filterRootSourceItems(items = [], source = {}, sourceStates = {}, containment = []) {
  const rootLineageKeys = source.rootLineageKeys || [];
  if (!Array.isArray(rootLineageKeys) || !rootLineageKeys.length) return items;
  const accessibleIdsByType = accessibleEntityIds(sourceStates);
  return items.filter(entity => rootLineageKeys.every(key => {
    const parentId = entity?.lineage?.[key];
    if (!hasEntityRefValue(parentId)) return true;
    const relation = containment.find(item => (
      item.childType === source.entityType && item.lineageKey === key
    ));
    if (!relation?.parentType) return true;
    return !accessibleIdsByType.get(relation.parentType)?.has(String(parentId));
  }));
}

function accessibleEntityIds(sourceStates = {}) {
  const result = new Map();
  for (const state of Object.values(sourceStates || {})) {
    const entityType = state?.source?.entityType;
    if (!entityType) continue;
    const entities = state.source.mode === 'single' ? [state.entity] : state.items;
    for (const entity of entities || []) {
      const id = entity?._id?.toString?.() || entity?.identity?.uid?.toString?.() || entity?.id?.toString?.();
      if (!id) continue;
      if (!result.has(entityType)) result.set(entityType, new Set());
      result.get(entityType).add(String(id));
    }
  }
  return result;
}

function hasEntityRefValue(value) {
  return value !== undefined && value !== null && value !== '';
}
