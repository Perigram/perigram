export function filterRootSourceItems(items = [], source = {}, sourceStates = {}) {
  const accessibleIdsByType = accessibleEntityIds(sourceStates);
  return items.filter(entity => !ancestorRefs(entity, source.typeId, source.lineageBindings || [])
    .some(ref => accessibleIdsByType.get(ref.type)?.has(ref.id)));
}

// The type-level parent map for client tree builders (explorer, mobile
// tabs): containment names a type's parent — except itself. Recursive
// containment nests INSTANCES under instances (the entity-level
// childrenByKey walk) and never roots the type node under itself, the
// same law the compiler's home suppression applies to self-pairs. A
// self-pair here made the recursive type its own child, so no root node
// was emitted and its section vanished from the explorer entirely.
export function typeParentOf(containment = []) {
  const parentOf = new Map();
  for (const triple of containment || []) {
    if (!triple?.childType || !triple?.parentType) continue;
    if (triple.childType === triple.parentType) continue;
    if (!parentOf.has(triple.childType)) parentOf.set(triple.childType, triple.parentType);
  }
  return parentOf;
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

// Wire reconciliation for a source's resolved filters: every filter must
// hold on the wire DTO. Lineage filter keys (the compiled child-source
// convention: the declared bare lineageKey) live under `lineage.<key>`,
// not at the DTO root — a created child carrying its parent ref must
// therefore match the open parent detail's child region and accumulate
// into it. Status-window filters (`primaryState`/`primaryStates`) read
// the flat `state`; dotted paths read verbatim.
export function entityMatchesFilters(entity = {}, filters = {}) {
  return Object.entries(filters || {}).every(([path, expected]) => {
    if (path === 'primaryState') return entity.state === expected;
    if (path === 'primaryStates') return String(expected).split(',').includes(entity.state);
    if (expected && typeof expected === 'object') return false;
    const actual = readFilterPath(entity, path);
    return String(actual ?? '') === String(expected ?? '');
  });
}

function readFilterPath(entity = {}, path = '') {
  const segments = String(path).split('.');
  const dotted = segments.reduce((value, key) => (value == null ? undefined : value[key]), entity);
  if (dotted !== undefined || segments.length > 1) return dotted;
  return entity?.lineage?.[segments[0]];
}

function accessibleEntityIds(sourceStates = {}) {
  const result = new Map();
  for (const state of Object.values(sourceStates || {})) {
    const typeId = normalizeType(state?.source?.typeId);
    if (!typeId) continue;
    const entities = state.source.mode === 'single' ? [state.entity] : state.items;
    for (const entity of entities || []) {
      const id = entity?._id?.toString?.() || entity?._id?.toString?.() || entity?.id?.toString?.();
      if (!id) continue;
      if (!result.has(typeId)) result.set(typeId, new Set());
      result.get(typeId).add(String(id));
    }
  }
  return result;
}

function ancestorRefs(entity = {}, typeId = '', lineageBindings = []) {
  const lineage = entity?.lineage || {};
  const refs = [];
  const visitedTypes = new Set([normalizeType(typeId)]);
  const pendingTypes = [normalizeType(typeId)];
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
