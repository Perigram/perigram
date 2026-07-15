function stringId(value) {
  return value?.toString?.() || value || '';
}

function parameterSignature(parameters = {}) {
  return JSON.stringify(Object.entries(parameters || {})
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([left], [right]) => left.localeCompare(right)));
}

function designMatchesLegacySource(design = {}, sourceId = '', parameters = {}) {
  const originalId = stringId(design.lineage?.originalCassetteId);
  if (!sourceId || originalId !== sourceId) return false;
  const designParameters = design.data?.parameters || design.data?.dimensions || {};
  return parameterSignature(designParameters) === parameterSignature(parameters);
}

export function resolveQueueItemEntity(item = {}, sources = {}) {
  const id = stringId(item.id || item.cassetteTemplateId);
  if (!id) return null;

  const cassettes = Array.isArray(sources.cassettes) ? sources.cassettes : [];
  const cassetteDesigns = Array.isArray(sources.cassetteDesigns) ? sources.cassetteDesigns : [];
  const direct = [...cassettes, ...cassetteDesigns].find(entity => stringId(entity?._id) === id);
  if (direct) return direct;

  return cassetteDesigns.find(design => designMatchesLegacySource(design, id, item.parameters || item.dimensions || {}))
    || cassetteDesigns.find(design => stringId(design.lineage?.originalCassetteId) === id)
    || null;
}

export function canonicalQueueItem(item = {}, sources = {}) {
  const entity = resolveQueueItemEntity(item, sources);
  if (!entity) return null;
  const id = stringId(entity._id);
  if (!id) return null;
  const entityType = entity.data?.geometry || entity.data?.polygonParts || entity.data?.layerData
    ? 'cassette_design'
    : 'cassette';

  return {
    ...item,
    id,
    cassetteTemplateId: id,
    entityType
  };
}
