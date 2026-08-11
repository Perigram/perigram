import { canonicalEntityType, entitySurfaceKey } from '@cutkit/domain-cnc';

export function normalizeHierarchyType(type = '') {
  return canonicalEntityType(type);
}

export function hierarchyTypeAlias(type = '') {
  return entitySurfaceKey(type);
}

export function entityHierarchyId(entity = {}) {
  return entity._id?.toString?.() || entity.identity?.uid?.toString?.() || entity.id?.toString?.() || '';
}

export function entityHierarchyIds(entity = {}) {
  const ids = [
    entity._id?.toString?.(),
    entity.identity?.uid?.toString?.(),
    entity.identity?.slug?.toString?.(),
    entity.id?.toString?.()
  ].filter(value => value != null && value !== '');
  return [...new Set(ids)];
}

export function containmentParent(entityType = '', lineage = {}, containment = []) {
  const childType = normalizeHierarchyType(entityType);
  const candidates = (containment || []).filter(relation => (
    normalizeHierarchyType(relation.childType) === childType && lineage?.[relation.lineageKey]
  ));
  if (!candidates.length) return null;
  const parentTypesInCandidates = new Set(candidates.map(candidate => normalizeHierarchyType(candidate.parentType)));
  return candidates.find(candidate => !parentTypesInCandidates.has(childType) && lineage?.[candidate.lineageKey]) || candidates[0];
}

export function containmentAncestors(entity = {}, entityType = '', containment = []) {
  const lineage = entity?.lineage || {};
  const refs = [];
  const visited = new Set();
  let childType = normalizeHierarchyType(entityType || entity?.entityType);

  while (childType) {
    const relation = containmentParent(childType, lineage, containment);
    if (!relation) break;
    const id = lineage[relation.lineageKey]?.toString?.() || lineage[relation.lineageKey];
    const parentType = normalizeHierarchyType(relation.parentType);
    const key = `${parentType}:${id}`;
    if (!id || visited.has(key)) break;
    visited.add(key);
    refs.unshift({ type: parentType, id, lineageKey: relation.lineageKey });
    childType = parentType;
  }

  const organizationId = lineage.organizationId?.toString?.() || lineage.organizationId;
  if (organizationId && !refs.some(ref => ref.type === 'organization' && ref.id?.toString() === organizationId.toString())) {
    refs.unshift({ type: 'organization', id: organizationId, lineageKey: 'organizationId' });
  }
  return refs;
}

export function hierarchyReferences(entity = {}, entityType = '', containment = []) {
  const refs = containmentAncestors(entity, entityType, containment);
  const id = entityHierarchyId(entity);
  const type = normalizeHierarchyType(entityType || entity?.entityType);
  if (type && id) refs.push({ type, id, current: true });
  return refs;
}

export function routeContextTraceExclusions(entity = {}, entityType = '', containment = [], routeQuery = {}) {
  return containmentAncestors(entity, entityType, containment).filter(ref => {
    const contextId = routeQuery?.[ref.lineageKey];
    const value = Array.isArray(contextId) ? contextId[0] : contextId;
    return value !== undefined && value !== null && String(value) === String(ref.id);
  });
}

export function traceContextExclusions({ exclusions = [], displayedContexts = [], activeOrganizationId = '' } = {}) {
  const displayed = (displayedContexts || []).flatMap(context => {
    if (!context?.type) return [];
    return entityHierarchyIds(context.entity || {}).map(id => ({ type: context.type, id }));
  });
  const activeOrganization = activeOrganizationId
    ? [{ type: 'organization', id: activeOrganizationId?.toString?.() || activeOrganizationId }]
    : [];
  return [...exclusions, ...displayed, ...activeOrganization]
    .filter(ref => ref?.type && ref?.id !== undefined && ref?.id !== null && ref?.id !== '');
}

export function visibleTraceAncestors(ancestors = [], exclusions = []) {
  return (ancestors || []).filter(ref => !(exclusions || []).some(exclusion => (
    normalizeHierarchyType(exclusion?.type) === normalizeHierarchyType(ref?.type)
    && String(exclusion?.id || '') === String(ref?.id || '')
  )));
}

export function rootContainmentFilter(entityType = '', containment = []) {
  const keys = (containment || [])
    .filter(relation => normalizeHierarchyType(relation.childType) === normalizeHierarchyType(entityType))
    .map(relation => relation.lineageKey);
  return Object.fromEntries([...new Set(keys)].map(key => [`lineage.${key}`, { $exists: false }]));
}

export function siblingContainmentScope(entity = {}, entityType = '', containment = []) {
  const relation = containmentParent(entityType, entity?.lineage || {}, containment);
  if (!relation) return {};
  return { [relation.lineageKey]: entity.lineage[relation.lineageKey] };
}

export function projectHierarchyRoute({ type = '', id = '', entity = null, project = null } = {}) {
  const normalizedType = normalizeHierarchyType(type);
  const projectEntity = normalizedType === 'project' ? entity : project;
  const projectSlug = projectEntity?.identity?.slug
    || projectEntity?.identity?.uid
    || projectEntity?.slug
    || (normalizedType === 'project' ? id : '');
  if (normalizedType === 'project') return projectSlug ? `/project/${projectSlug}/queues` : null;
  if (!projectSlug || !id) return null;
  if (normalizedType === 'queue') return `/project/${projectSlug}/queue/${id}`;
  if (normalizedType === 'sheet_design') return `/project/${projectSlug}/sheet-design/${id}`;
  return null;
}
