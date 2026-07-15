const ENTITY_TYPE_ALIASES = {
  artifact: 'artifact',
  batch_pile: 'batchPile',
  cassette: 'cassette',
  cassette_design: 'cassetteDesign',
  cassette_instance: 'cassetteInstance',
  cassette_template: 'cassetteTemplate',
  catalog: 'catalog',
  color: 'color',
  entity_revision: 'entityRevision',
  geometry_capture: 'geometryCapture',
  layer_standard: 'layerStandard',
  library: 'library',
  material: 'material',
  material_pile: 'materialPile',
  nesting_run: 'nestingRun',
  organization: 'organization',
  pen_template: 'penTemplate',
  profile_template: 'profileTemplate',
  project: 'project',
  queue: 'queue',
  remnant: 'remnant',
  requisition: 'requisition',
  sheet: 'sheet',
  sheet_design: 'sheetDesign',
  tool_profile: 'toolProfile',
  user: 'user',
  warehouse: 'warehouse'
};

const SOURCE_TYPE_MAP = {
  ARTIFACT: 'artifact',
  CASSETTE: 'cassette',
  CASSETTE_DESIGN: 'cassetteDesign',
  CASSETTE_INSTANCE: 'cassetteInstance',
  CATALOG: 'catalog',
  COLOR: 'color',
  LIBRARY: 'library',
  MATERIAL: 'material',
  NESTING_RUN: 'nestingRun',
  ORGANIZATION: 'organization',
  PILE: 'materialPile',
  PROJECT: 'project',
  QUEUE: 'queue',
  REMNANT: 'remnant',
  REQUISITION: 'requisition',
  SHEET: 'sheet',
  SHEET_DESIGN: 'sheetDesign',
  USER: 'user',
  WAREHOUSE: 'warehouse'
};

const OBJECT_LIST_KEY_TYPES = {
  artifactIds: 'artifact',
  cassetteDesignIds: 'cassetteDesign',
  cassetteIds: 'cassette',
  cassetteInstanceIds: 'cassetteInstance',
  colorIds: 'color',
  materialPileIds: 'materialPile',
  pileIds: 'materialPile',
  queueIds: 'queue',
  remnantIds: 'remnant',
  runIds: 'nestingRun',
  sheetDesignIds: 'sheetDesign',
  sheetIds: 'sheet'
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
