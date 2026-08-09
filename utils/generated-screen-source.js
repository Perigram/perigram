export function filterRootSourceItems(items = [], source = {}, sourceStates = {}, containment = []) {
  const accessibleIdsByType = accessibleEntityIds(sourceStates);
  return items.filter(entity => !ancestorRefs(entity, source.entityType, containment, accessibleIdsByType)
    .some(ref => accessibleIdsByType.get(ref.type)?.has(ref.id)));
}

export function shouldRenderHomeSection({ items = [], rawItems = [], source = {} } = {}, containment = []) {
  const parentLineageKeys = (containment || [])
    .filter(relation => normalizeType(relation.childType) === normalizeType(source.entityType))
    .filter(relation => normalizeType(relation.parentType) !== 'organization')
    .map(relation => relation.lineageKey)
    .filter(Boolean);
  if (parentLineageKeys.length && (
    !rawItems.length
    || rawItems.some(entity => parentLineageKeys.some(key => entity?.lineage?.[key]))
  )) return false;
  if (items.length) return true;
  if (rawItems.length) return false;
  return !(source.rootLineageKeys || []).length;
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

function ancestorRefs(entity = {}, entityType = '', containment = [], accessibleIdsByType = new Map()) {
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
  for (const [key, value] of Object.entries(lineage)) {
    if (!key.endsWith('Id') || value === undefined || value === null || value === '') continue;
    const lineageTypeKey = comparableType(key.slice(0, -2));
    for (const accessibleType of accessibleIdsByType.keys()) {
      if (accessibleType === 'organization' || comparableType(accessibleType) !== lineageTypeKey) continue;
      refs.push({ type: accessibleType, id: String(value) });
    }
  }
  return [...new Map(refs.map(ref => [`${ref.type}:${ref.id}`, ref])).values()];
}

function normalizeType(type = '') {
  return String(type || '').replace(/-/g, '_');
}

function comparableType(type = '') {
  return normalizeType(type).replace(/_/g, '').toLowerCase();
}
