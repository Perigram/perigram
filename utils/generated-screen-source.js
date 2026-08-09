export function filterRootSourceItems(items = [], source = {}, sourceStates = {}, containment = []) {
  const accessibleIdsByType = accessibleEntityIds(sourceStates);
  return items.filter(entity => !ancestorRefs(entity, source.entityType, containment)
    .some(ref => accessibleIdsByType.get(ref.type)?.has(ref.id)));
}

function accessibleEntityIds(sourceStates = {}) {
  const result = new Map();
  for (const state of Object.values(sourceStates || {})) {
    const entityType = normalizeType(state?.source?.entityType);
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

function ancestorRefs(entity = {}, entityType = '', containment = []) {
  const lineage = entity?.lineage || {};
  const refs = [];
  const visitedTypes = new Set([normalizeType(entityType)]);
  const pendingTypes = [normalizeType(entityType)];
  while (pendingTypes.length) {
    const childType = pendingTypes.shift();
    for (const relation of containment || []) {
      if (normalizeType(relation.childType) !== childType) continue;
      const parentId = lineage[relation.lineageKey];
      const parentType = normalizeType(relation.parentType);
      if (parentType === 'organization' || parentId === undefined || parentId === null || parentId === '') continue;
      refs.push({ type: parentType, id: String(parentId) });
      if (!visitedTypes.has(parentType)) {
        visitedTypes.add(parentType);
        pendingTypes.push(parentType);
      }
    }
  }
  return refs;
}

function normalizeType(type = '') {
  return String(type || '').replace(/-/g, '_');
}
