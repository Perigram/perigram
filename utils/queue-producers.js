function entityId(value) {
  if (!value) return '';
  if (typeof value !== 'object') return value?.toString?.() || value;
  return value._id?.toString?.()
    || value.id?.toString?.()
    || value.identity?.uid?.toString?.()
    || '';
}

function getByPath(source = {}, path = '') {
  return String(path || '')
    .split('.')
    .filter(Boolean)
    .reduce((cursor, key) => cursor?.[key], source);
}

export function producerFieldsForAction(action = {}, fields = [], autoEntityTypes = []) {
  const autoTypes = new Set(autoEntityTypes);
  const next = [...fields];

  for (const contract of action.contracts?.inputs || []) {
    if (!contract?.entityType || autoTypes.has(contract.entityType)) continue;
    const represented = next.some(field => (
      field?.id === contract.id
      || field?.entityType === contract.entityType
      || (Array.isArray(field?.accepts) && field.accepts.includes(contract.entityType))
    ));
    if (represented) continue;
    next.push({
      id: contract.id || contract.entityType,
      path: contract.id || contract.entityType,
      label: contract.label || contract.id || contract.entityType,
      type: contract.kind === 'entity_list' ? 'entityList' : 'entity',
      entityType: contract.entityType,
      required: contract.required !== false,
      prompt: true
    });
  }

  return [...new Map(next.filter(field => field?.id).map(field => [field.id, field])).values()];
}

export function buildProducerActionRequest({
  action = {},
  fields = [],
  values = {},
  data = {},
  contextEntities = {}
} = {}) {
  const entities = {};
  for (const contract of action.contracts?.inputs || []) {
    if (!contract?.entityType) continue;
    const field = fields.find(candidate => candidate.id === contract.id)
      || fields.find(candidate => candidate.entityType === contract.entityType)
      || fields.find(candidate => Array.isArray(candidate.accepts) && candidate.accepts.includes(contract.entityType));
    const raw = contextEntities[contract.entityType]
      || values[contract.id]
      || (field ? values[field.id] : null)
      || (field ? getByPath(data, field.path || field.id) : null);
    const value = contract.kind === 'entity_list'
      ? (Array.isArray(raw) ? raw : [raw].filter(Boolean)).map(entityId).filter(Boolean)
      : entityId(raw);
    if ((Array.isArray(value) && !value.length) || !value) continue;
    entities[contract.id || contract.entityType] = value;
    if (entities[contract.entityType] === undefined) entities[contract.entityType] = value;
  }

  return {
    data,
    entities,
    parameters: data.parameters && typeof data.parameters === 'object' ? data.parameters : data
  };
}

export function templatesAvailableToProject(templates = [], libraryRefs = []) {
  const linked = new Set((Array.isArray(libraryRefs) ? libraryRefs : [libraryRefs])
    .map(ref => ref?.id || ref)
    .filter(Boolean)
    .map(String));

  return templates.filter(template => {
    const libraryId = template?.lineage?.libraryId?.toString?.() || template?.lineage?.libraryId;
    return !libraryId || linked.has(libraryId.toString());
  });
}
