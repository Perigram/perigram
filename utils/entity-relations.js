import { normalizeHierarchyType } from './entity-hierarchy.js';

export function resolveEntityRelationRefs(rawValue, field = {}) {
  const refs = [];
  appendRelationValue(refs, rawValue, field.typeId || null);
  return dedupeRelationRefs(refs);
}

function appendRelationValue(refs, rawValue, fallbackTypeId = null) {
  if (!rawValue) return;

  if (Array.isArray(rawValue)) {
    for (const item of rawValue) {
      const ref = normalizeRelationRef(item, fallbackTypeId);
      if (ref) refs.push(ref);
    }
    return;
  }

  if (typeof rawValue === 'object') {
    const ref = normalizeRelationRef(rawValue, fallbackTypeId);
    if (ref) refs.push(ref);
  }
}

function normalizeRelationRef(value, fallbackTypeId = null) {
  if (value == null || value === '') return null;

  if (typeof value === 'string' || typeof value === 'number') {
    return fallbackTypeId ? { typeId: fallbackTypeId, id: String(value) } : null;
  }

  if (typeof value !== 'object') return null;

  const id = value.id || value.entityId || value._id || value.value;
  const typeId = normalizeHierarchyType(value.typeId || value.type || fallbackTypeId);
  if (!id || !typeId) return null;

  if (value.revisionId) {
    return {
      typeId: 'entity_revision',
      id: String(value.revisionId),
      source: { typeId, id: String(id) },
      entity: null
    };
  }

  return {
    typeId,
    id: String(id),
    entity: value.identity || value.data || value.status || value.lineage ? value : null
  };
}

function dedupeRelationRefs(refs = []) {
  return Array.from(new Map(refs
    .filter(ref => ref?.typeId && ref?.id)
    .map(ref => [`${ref.typeId}:${ref.id}`, ref])
  ).values());
}
