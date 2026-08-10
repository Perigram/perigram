import { cncEntities } from '@cutkit/domain-cnc';

const toCamelCase = (type = '') => String(type || '').replace(/_([a-z0-9])/g, (_, character) => character.toUpperCase());

const ENTITY_TYPE_ALIASES = Object.fromEntries(
  cncEntities.map(entity => [entity.type, toCamelCase(entity.type)])
);
const SOURCE_TYPE_MAP = Object.fromEntries(
  cncEntities
    .filter(entity => entity.type !== 'batch_pile' && entity.type !== 'pile')
    .map(entity => [entity.type.toUpperCase(), toCamelCase(entity.type)])
);
const OBJECT_LIST_KEY_TYPES = {
  ...Object.fromEntries(
    cncEntities.map(entity => [`${toCamelCase(entity.type)}Ids`, toCamelCase(entity.type)])
  ),
  runIds: 'nestingRun',
  pileIds: 'materialPile'
};

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
    if (ref) {
      refs.push(ref);
      return;
    }
    for (const [key, value] of Object.entries(rawValue)) {
      if (!Array.isArray(value) || !value.length) continue;
      appendRelationValue(refs, value, OBJECT_LIST_KEY_TYPES[key] || fallbackEntityType);
    }
  }
}

function normalizeRelationRef(value, fallbackEntityType = null) {
  if (value == null || value === '') return null;

  if (typeof value === 'string' || typeof value === 'number') {
    return fallbackEntityType ? { entityType: fallbackEntityType, id: String(value) } : null;
  }

  if (typeof value !== 'object') return null;

  const id = value.id || value.entityId || value._id || value.value;
  const entityType = normalizeEntityType(value.entityType || value.type || fallbackEntityType);
  if (!id || !entityType) return null;

  if (value.revisionId) {
    return {
      entityType: 'entityRevision',
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

function normalizeEntityType(value) {
  if (!value) return null;
  const sourceType = String(value);
  return ENTITY_TYPE_ALIASES[sourceType]
    || ENTITY_TYPE_ALIASES[sourceType.toLowerCase()]
    || SOURCE_TYPE_MAP[sourceType.toUpperCase()]
    || sourceType;
}

function dedupeRelationRefs(refs = []) {
  return Array.from(new Map(refs
    .filter(ref => ref?.entityType && ref?.id)
    .map(ref => [`${ref.entityType}:${ref.id}`, ref])
  ).values());
}
