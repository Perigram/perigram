export function createEndpointMap(definitions = []) {
  return Object.fromEntries(definitions.map(definition => [
    definition.type,
    {
      single: id => (definition.routes?.single || `/api/${definition.collection || `${definition.type}s`}/:id`).replace(':id', id),
      download: id => (definition.routes?.download || definition.routes?.single || `/api/${definition.collection || `${definition.type}s`}/:id`).replace(':id', id),
      list: definition.routes?.list || `/api/${definition.collection || `${definition.type}s`}`
    }
  ]));
}

export function createDomainUiAdapter(domain = {}) {
  const endpointMap = createEndpointMap(domain.ui?.endpoints || []);
  const surfaceMap = Object.fromEntries((domain.ui?.surfaces || []).map(surface => [surface.key || surface.entityType, surface]));
  const artifactTypeMap = domain.artifactTypes || domain.artifacts || {};

  return {
    endpointMap,
    surfaceMap,
    artifactTypeMap,
    getSingleEndpoint: (type, id) => getSingleEndpoint(endpointMap, type, id),
    getListEndpoint: (type, filters) => getListEndpoint(endpointMap, type, filters),
    getSurface: type => surfaceMap[type] || null,
    getIcon: type => surfaceMap[type]?.icon || 'pi pi-box',
    getArtifactType: type => artifactTypeMap[type] || null,
    getArtifactPreview: type => artifactTypeMap[type]?.preview || { kind: 'download' },
    getDownloadEndpoint: (type, id) => endpointMap[type]?.download?.(id) || getSingleEndpoint(endpointMap, type, id)
  };
}

export function getSingleEndpoint(endpointMap, type, id) {
  return endpointMap[type]?.single(id) || `/api/${type}/${id}`;
}

export function getListEndpoint(endpointMap, type, filters = {}) {
  const base = endpointMap[type]?.list || `/api/${type}s`;
  const params = new URLSearchParams(filters).toString();
  return params ? `${base}?${params}` : base;
}
