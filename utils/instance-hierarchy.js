// Mechanical key normalization (registry-known ids resolve through the
// instances store; these helpers cover the legacy surface-key vocabulary):
// canonical keys are snake_case, kebab graph ids normalize to snake.
export function normalizeHierarchyType(type = '') {
  return String(type || '').replace(/-/g, '_').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

export function instanceHierarchyId(entity = {}) {
  return entity._id?.toString?.() || entity.id?.toString?.() || '';
}

export function instanceHierarchyIds(entity = {}) {
  const ids = [
    entity._id?.toString?.(),
    
    entity.identity?.slug?.toString?.(),
    entity.id?.toString?.()
  ].filter(value => value != null && value !== '');
  return [...new Set(ids)];
}

export function containmentParent(typeId = '', lineage = {}, containment = []) {
  const childType = normalizeHierarchyType(typeId);
  const candidates = (containment || []).filter(relation => (
    normalizeHierarchyType(relation.childType) === childType && lineage?.[relation.lineageKey]
  ));
  if (!candidates.length) return null;
  const parentTypesInCandidates = new Set(candidates.map(candidate => normalizeHierarchyType(candidate.parentType)));
  return candidates.find(candidate => !parentTypesInCandidates.has(childType) && lineage?.[candidate.lineageKey]) || candidates[0];
}

export function containmentAncestors(entity = {}, typeId = '', containment = []) {
  const lineage = entity?.lineage || {};
  const refs = [];
  const visited = new Set();
  let childType = normalizeHierarchyType(typeId || entity?.typeId);

  while (childType) {
    const relation = containmentParent(childType, lineage, containment);
    if (!relation) break;
    const ref = lineage[relation.lineageKey];
    // Refs match in both stored shapes (the `{ id }` object and the
    // normalized id) — the same law every containment matcher reads.
    const id = ref?.id ?? ref;
    const parentType = relation.parentType;
    const parentKey = normalizeHierarchyType(parentType);
    const key = `${parentKey}:${id}`;
    if (!id || visited.has(key)) break;
    visited.add(key);
    // Ancestor refs carry the declaration's canonical type id: breadcrumbs
    // resolve served type records and popup surfaces by it.
    refs.unshift({ type: parentType, id, lineageKey: relation.lineageKey });
    childType = parentKey;
  }

  const organizationRef = lineage.organizationId;
  const organizationId = organizationRef?.id ?? organizationRef;
  if (organizationId && !refs.some(ref => ref.type === 'organization' && ref.id?.toString() === String(organizationId))) {
    refs.unshift({ type: 'organization', id: organizationId, lineageKey: 'organizationId' });
  }
  return refs;
}

export function routeContextTraceExclusions(entity = {}, typeId = '', containment = [], routeQuery = {}) {
  return containmentAncestors(entity, typeId, containment).filter(ref => {
    const contextId = routeQuery?.[ref.lineageKey];
    const value = Array.isArray(contextId) ? contextId[0] : contextId;
    return value !== undefined && value !== null && String(value) === String(ref.id);
  });
}

export function traceContextExclusions({ exclusions = [], activeOrganizationId = '' } = {}) {
  const activeOrganization = activeOrganizationId
    ? [{ type: 'organization', id: activeOrganizationId?.toString?.() || activeOrganizationId }]
    : [];
  return [...exclusions, ...activeOrganization]
    .filter(ref => ref?.type && ref?.id !== undefined && ref?.id !== null && ref?.id !== '');
}

export function visibleTraceAncestors(ancestors = [], exclusions = []) {
  return (ancestors || []).filter(ref => !(exclusions || []).some(exclusion => (
    normalizeHierarchyType(exclusion?.type) === normalizeHierarchyType(ref?.type)
    && String(exclusion?.id || '') === String(ref?.id || '')
  )));
}

export function rootContainmentFilter(typeId = '', containment = []) {
  const keys = (containment || [])
    .filter(relation => normalizeHierarchyType(relation.childType) === normalizeHierarchyType(typeId))
    .map(relation => relation.lineageKey);
  return Object.fromEntries([...new Set(keys)].map(key => [`lineage.${key}`, { $exists: false }]));
}

export function siblingContainmentScope(entity = {}, typeId = '', containment = []) {
  const relation = containmentParent(typeId, entity?.lineage || {}, containment);
  if (!relation) return {};
  return { [relation.lineageKey]: entity.lineage[relation.lineageKey] };
}

