function stringId(value) {
  return value?.toString?.() || value || '';
}

export function resolveQueueItemEntity(item = {}, sources = {}) {
  const id = stringId(item.id);
  if (!id) return null;

  const cassettes = Array.isArray(sources.cassettes) ? sources.cassettes : [];
  const cassetteDesigns = Array.isArray(sources.cassetteDesigns) ? sources.cassetteDesigns : [];
  if (item.entityType === 'cassette') {
    return cassettes.find(entity => stringId(entity?._id) === id) || null;
  }
  if (item.entityType === 'cassette_design') {
    return cassetteDesigns.find(entity => stringId(entity?._id) === id) || null;
  }
  return cassetteDesigns.find(entity => stringId(entity?._id) === id) || null;
}

export function canonicalQueueItem(item = {}, sources = {}) {
  const entity = resolveQueueItemEntity(item, sources);
  if (!entity) return null;
  const id = stringId(entity._id);
  if (!id) return null;
  const isCassette = (Array.isArray(sources.cassettes) ? sources.cassettes : [])
    .some(candidate => stringId(candidate?._id) === id);
  return {
    ...item,
    id,
    entityType: item.entityType || (isCassette ? 'cassette' : 'cassette_design')
  };
}
