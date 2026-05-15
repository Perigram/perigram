export function createEndpointMap(definitions = []) {
  return Object.fromEntries(definitions.map(definition => [
    definition.type,
    {
      single: id => (definition.routes?.single || `/api/${definition.collection || `${definition.type}s`}/:id`).replace(':id', id),
      list: definition.routes?.list || `/api/${definition.collection || `${definition.type}s`}`
    }
  ]));
}

export function getSingleEndpoint(endpointMap, type, id) {
  return endpointMap[type]?.single(id) || `/api/${type}/${id}`;
}

export function getListEndpoint(endpointMap, type, filters = {}) {
  const base = endpointMap[type]?.list || `/api/${type}s`;
  const params = new URLSearchParams(filters).toString();
  return params ? `${base}?${params}` : base;
}
