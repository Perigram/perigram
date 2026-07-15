function stringId(value) {
  return value?.toString?.() || value || '';
}

export function resolveQueueItemEntity(item = {}, sources = {}) {
  const id = stringId(item.id);
  if (!id) return null;

  const cassetteDesigns = Array.isArray(sources.cassetteDesigns) ? sources.cassetteDesigns : [];
  return cassetteDesigns.find(entity => stringId(entity?._id) === id) || null;
}

export function canonicalQueueItem(item = {}, sources = {}) {
  const entity = resolveQueueItemEntity(item, sources);
  if (!entity) return null;
  const id = stringId(entity._id);
  if (!id) return null;
  return {
    ...item,
    id,
    entityType: 'cassette_design'
  };
}
