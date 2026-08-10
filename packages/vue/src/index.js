export function createEndpointMap(definitions = []) {
  const endpointMap = {};

  for (const definition of definitions) {
    const collection = definition.collection || `${definition.type}s`;
    const endpoint = {
      single: id => (definition.routes?.single || `/api/${collection}/:id`).replace(':id', id),
      download: id => (definition.routes?.download || definition.routes?.single || `/api/${collection}/:id`).replace(':id', id),
      list: definition.routes?.list || `/api/${collection}`
    };

    for (const key of createEndpointKeys(definition)) {
      endpointMap[key] = endpoint;
    }
  }

  return endpointMap;
}

export function createEndpointKeys(definition = {}) {
  return uniqueKeys([
    definition.entityType,
    definition.surfaceKey,
    definition.type
  ]);
}

function uniqueKeys(keys) {
  return [...new Set(keys.filter(Boolean))];
}

export function createDomainUiAdapter(domain = {}) {
  const endpointMap = createEndpointMap(domain.ui?.endpoints || []);
  const surfaceMap = createSurfaceMap(domain.ui?.surfaces || []);
  const attachmentKindMap = domain.attachmentKinds || {};

  return {
    endpointMap,
    surfaceMap,
    attachmentKindMap,
    containment: domain.containment || [],
    relations: domain.relations || [],
    construction: domain.construction || {},
    getSingleEndpoint: (type, id) => getSingleEndpoint(endpointMap, type, id),
    getListEndpoint: (type, filters) => getListEndpoint(endpointMap, type, filters),
    getSurface: type => surfaceMap[type] || null,
    getIcon: type => surfaceMap[type]?.icon || 'pi pi-box',
    getAttachmentKind: kind => attachmentKindMap[kind] || null,
    getAttachmentPreview: kind => attachmentKindMap[kind]?.preview || { mode: 'download' },
    getAttachmentCreation: kind => attachmentKindMap[kind]?.creation || { mode: 'workflow' },
    getAttachmentEditor: kind => attachmentKindMap[kind]?.editor || { mode: 'none' },
    getDownloadEndpoint: (type, id) => endpointMap[type]?.download?.(id) || getSingleEndpoint(endpointMap, type, id)
  };
}

export function createSurfaceMap(surfaces = []) {
  const surfaceMap = {};

  for (const surface of surfaces) {
    for (const key of createSurfaceKeys(surface)) {
      surfaceMap[key] = surface;
    }
  }

  return surfaceMap;
}

export function createSurfaceKeys(surface = {}) {
  return uniqueKeys([
    surface.key,
    surface.entityType
  ]);
}

export function getSingleEndpoint(endpointMap, type, id) {
  return endpointMap[type]?.single(id) || `/api/${type}/${id}`;
}

export function getListEndpoint(endpointMap, type, filters = {}) {
  const base = endpointMap[type]?.list || `/api/${type}s`;
  const params = new URLSearchParams(filters).toString();
  return params ? `${base}?${params}` : base;
}
