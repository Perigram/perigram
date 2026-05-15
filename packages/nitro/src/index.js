export function createEntityRouteMap(definitions = []) {
  return Object.fromEntries(definitions.map(definition => [
    definition.type,
    {
      single: definition.routes?.single || `/api/${definition.collection || `${definition.type}s`}/:id`,
      list: definition.routes?.list || `/api/${definition.collection || `${definition.type}s`}`
    }
  ]));
}

export function resolveEntityRoute(routeMap, type, id = null) {
  const route = routeMap[type];
  if (!route) return null;
  return id ? route.single.replace(':id', id) : route.list;
}
