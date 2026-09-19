import { normalizeHierarchyType } from './entity-hierarchy.js';

export function resolveEntityRelationRefs(rawValue, field = {}) {
  const refs = [];
  appendRelationValue(refs, rawValue, field.entityType || null);
  return dedupeRelationRefs(refs);
}

function appendRelationValue(refs, rawValue, fallbackEntityType = null) {
  if (!rawValue) return;

  if (Array.isArray(rawValue)) {
    for (const item of rawValue) {
      const ref = normalizeRelationRef(item, fallbackEntityType);
      if (ref) refs.push(ref);
    }
    return;
  }

  if (typeof rawValue === 'object') {
    const ref = normalizeRelationRef(rawValue, fallbackEntityType);
    if (ref) refs.push(ref);
  }
}

function normalizeRelationRef(value, fallbackEntityType = null) {
  if (value == null || value === '') return null;

  if (typeof value === 'string' || typeof value === 'number') {
    return fallbackEntityType ? { entityType: fallbackEntityType, id: String(value) } : null;
  }

  if (typeof value !== 'object') return null;

  const id = value.id || value.entityId || value._id || value.value;
  const entityType = normalizeHierarchyType(value.entityType || value.type || fallbackEntityType);
  if (!id || !entityType) return null;

  if (value.revisionId) {
    return {
      entityType: 'entity_revision',
      id: String(value.revisionId),
      source: { entityType, id: String(id) },
      entity: null
    };
  }

  return {
    entityType,
    id: String(id),
    entity: value.identity || value.data || value.status || value.lineage ? value : null
  };
}

function dedupeRelationRefs(refs = []) {
  return Array.from(new Map(refs
    .filter(ref => ref?.entityType && ref?.id)
    .map(ref => [`${ref.entityType}:${ref.id}`, ref])
  ).values());
}
