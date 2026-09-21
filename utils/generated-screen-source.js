export function filterRootSourceItems(items = [], source = {}, sourceStates = {}) {
  const accessibleIdsByType = accessibleEntityIds(sourceStates);
  return items.filter(entity => !ancestorRefs(entity, source.typeId, source.lineageBindings || [])
    .some(ref => accessibleIdsByType.get(ref.type)?.has(ref.id)));
}

export function shouldRenderHomeSection({ items = [], rawItems = [], source = {} } = {}) {
  const parentLineageKeys = (source.lineageBindings || [])
    .filter(binding => normalizeType(binding.childTypeId) === normalizeType(source.typeId))
    .filter(binding => normalizeType(binding.parentTypeId) !== 'organization')
    .map(binding => binding.lineageKey)
    .filter(Boolean);
  if (parentLineageKeys.length && (
    !rawItems.length
    || rawItems.some(entity => parentLineageKeys.some(key => entity?.lineage?.[key]))
  )) return false;
  if (items.length) return true;
  if (rawItems.length) return false;
  return !parentLineageKeys.length;
}

function accessibleEntityIds(sourceStates = {}) {
  const result = new Map();
  for (const state of Object.values(sourceStates || {})) {
    const entityType = normalizeType(state?.source?.typeId);
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

function ancestorRefs(entity = {}, entityType = '', lineageBindings = []) {
  const lineage = entity?.lineage || {};
  const refs = [];
  const visitedTypes = new Set([normalizeType(entityType)]);
  const pendingTypes = [normalizeType(entityType)];
  while (pendingTypes.length) {
    const childType = pendingTypes.shift();
    for (const binding of lineageBindings || []) {
      if (normalizeType(binding.childTypeId) !== childType) continue;
      const parentId = lineage[binding.lineageKey];
      const parentType = normalizeType(binding.parentTypeId);
      if (parentType === 'organization' || parentId === undefined || parentId === null || parentId === '') continue;
      refs.push({ type: parentType, id: String(parentId) });
      if (!visitedTypes.has(parentType)) {
        visitedTypes.add(parentType);
        pendingTypes.push(parentType);
      }
    }
  }
  return [...new Map(refs.map(ref => [`${ref.type}:${ref.id}`, ref])).values()];
}

function normalizeType(type = '') {
  return String(type || '').replace(/-/g, '_');
}
