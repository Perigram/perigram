import { cncContainment } from '@cutkit/domain-cnc';

const TYPE_ALIASES = {
  cassetteTemplate: 'cassette',
  cassetteDesign: 'cassette_design',
  cassetteInstance: 'cassette_instance',
  nestingRun: 'nesting_run',
  sheetDesign: 'sheet_design',
  materialPile: 'material_pile',
  batchPile: 'batch_pile'
};

export function normalizeHierarchyType(type = '') {
  return TYPE_ALIASES[type] || String(type || '').replace(/-/g, '_');
}

export function hierarchyTypeAlias(type = '') {
  const normalized = normalizeHierarchyType(type);
  return Object.entries(TYPE_ALIASES).find(([, value]) => value === normalized)?.[0] || normalized;
}

export function entityHierarchyId(entity = {}) {
  return entity._id?.toString?.() || entity.identity?.uid?.toString?.() || entity.id?.toString?.() || '';
}

export function containmentParent(entityType = '', lineage = {}, containment = cncContainment) {
  const childType = normalizeHierarchyType(entityType);
  const candidates = (containment || []).filter(relation => (
    normalizeHierarchyType(relation.childType) === childType && lineage?.[relation.lineageKey]
  ));
  if (!candidates.length) return null;
  const parentTypesInCandidates = new Set(candidates.map(candidate => normalizeHierarchyType(candidate.parentType)));
  return candidates.find(candidate => !parentTypesInCandidates.has(childType) && lineage?.[candidate.lineageKey]) || candidates[0];
}

export function containmentAncestors(entity = {}, entityType = '', containment = cncContainment) {
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

export function hierarchyReferences(entity = {}, entityType = '', containment = cncContainment) {
  const refs = containmentAncestors(entity, entityType, containment);
  const id = entityHierarchyId(entity);
  const type = normalizeHierarchyType(entityType || entity?.entityType);
  if (type && id) refs.push({ type, id, current: true });
  return refs;
}

export function rootContainmentFilter(entityType = '', containment = cncContainment) {
  const keys = (containment || [])
    .filter(relation => normalizeHierarchyType(relation.childType) === normalizeHierarchyType(entityType))
    .map(relation => relation.lineageKey);
  return Object.fromEntries([...new Set(keys)].map(key => [`lineage.${key}`, { $exists: false }]));
}

export function siblingContainmentScope(entity = {}, entityType = '', containment = cncContainment) {
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
