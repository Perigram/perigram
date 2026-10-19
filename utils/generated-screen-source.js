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

// The $screen.-reference resolution contract: a source's identifier and
// filter values may address the screen's own scope (`$screen.scope.id`
// and friends); strings resolve against the screen object, composites
// resolve recursively, everything else passes through.
export function resolveSourceFilters(source = {}, screen = {}) {
  const filters = resolveScreenValue(source.filters || {}, screen) || {};
  const statuses = statusFiltersFromRequirement(source.required || screen.required || {});
  if (!statuses.length) return filters;
  if (statuses.length === 1) return { ...filters, primaryState: statuses[0] };
  return { ...filters, primaryStates: statuses.join(',') };
}

export function resolveSourceIdentifier(source = {}, screen = {}) {
  return resolveScreenValue(source.identifier, screen)
    || screen.scope?.instanceId
    || screen.scope?.[`${source.typeId}Id`]
    || '';
}

function statusFiltersFromRequirement(requirement = {}) {
  return [...new Set(statusesFromRule(requirement.rule))];
}

function statusesFromRule(rule) {
  if (!rule || typeof rule !== 'object') return [];
  if (Array.isArray(rule)) return rule.flatMap(statusesFromRule);
  if (Array.isArray(rule.any)) return rule.any.flatMap(statusesFromRule);
  if (Array.isArray(rule.all)) return rule.all.flatMap(statusesFromRule);
  if (rule.not) return [];
  if ((rule.fact === 'primaryState' || rule.fact === 'status.primary') && rule.equals) return [String(rule.equals)];
  if ((rule.fact === 'primaryState' || rule.fact === 'status.primary') && Array.isArray(rule.in)) return rule.in.map(String);
  return [];
}

function resolveScreenValue(value, screen = {}) {
  if (Array.isArray(value)) return value.map(item => resolveScreenValue(item, screen));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveScreenValue(item, screen)]));
  }
  if (typeof value !== 'string' || !value.startsWith('$screen.')) return value;
  return screenPathValue(screen, value.slice('$screen.'.length));
}

function screenPathValue(screen = {}, path = '') {
  return String(path || '').split('.').filter(Boolean).reduce((value, key) => (value == null ? undefined : value[key]), screen);
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
      // Refs match in both stored shapes (the `{ id }` object and the
      // normalized id) — the same law every containment matcher reads.
      const ref = lineage[binding.lineageKey];
      const parentId = ref?.id ?? ref;
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
