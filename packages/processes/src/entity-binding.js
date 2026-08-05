export function entityBindingSourceContract(source = {}, fallbackEntityType = '') {
  const exactReferenceType = typeof source.type === 'string' ? source.type : '';
  const type = source.type && typeof source.type === 'object' ? source.type : source;
  const listType = type.base === 'array' ? type.itemType : null;
  const base = listType?.base || type.base || source.kind || '';
  const entityType = listType?.entityType || type.entityType || source.entityType || exactReferenceType || fallbackEntityType || '';
  const cardinality = type.base === 'array' || type.shape === 'list' || source.multiple || source.kind === 'entity_list'
    ? 'many'
    : 'one';
  return {
    valid: Boolean(exactReferenceType || fallbackEntityType) || ['entity', 'entityRef'].includes(base) || ['entity', 'entity_list'].includes(source.kind),
    entityType,
    cardinality
  };
}

export function resolveEntityBinding({
  source = {},
  authoredEntityType = '',
  authoredPath = '',
  fields = [],
  block = '',
  access = 'constructible'
} = {}) {
  const contract = entityBindingSourceContract(source, authoredEntityType);
  if (!contract.valid || !contract.entityType) return { ...contract, path: '', matches: [] };
  const typedCandidates = fields.filter(field => {
    if (block && field.block !== block) return false;
    if (access && field[access] === false) return false;
    const fieldType = field.type || {};
    const itemType = fieldType.base === 'array' ? fieldType.itemType || {} : fieldType;
    return ['entity', 'entityRef'].includes(itemType.base)
      && itemType.entityType === contract.entityType;
  });
  const candidates = typedCandidates.filter(field => fieldCardinality(field) === contract.cardinality);
  const authored = candidates.find(field => field.path === authoredPath);
  const authoredTyped = typedCandidates.find(field => field.path === authoredPath);
  const resolved = authored || authoredTyped || (candidates.length === 1 ? candidates[0] : null)
    || (typedCandidates.length === 1 ? typedCandidates[0] : null);
  return {
    ...contract,
    sourceCardinality: contract.cardinality,
    cardinality: resolved ? fieldCardinality(resolved) : contract.cardinality,
    path: resolved?.path || '',
    matches: typedCandidates.map(field => field.path)
  };
}

function fieldCardinality(field = {}) {
  return field.type?.base === 'array' || field.type?.shape === 'list' ? 'many' : 'one';
}
