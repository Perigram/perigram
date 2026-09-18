// Shared process-binding helpers for the framework registry and mounted
// packs: the same binding contract (explicit processList/processGetById,
// construction handlers, capability verification) applies to framework
// services and pack-registered services alike.
export const GENERIC_CREATE = Symbol('genericCreate');

export const authFirstList = service => (filters, auth) => service.list(
  auth.userId,
  auth.organizationId,
  auth.role,
  auth,
  filters
);

export const authLastRead = service => (id, auth) => service.getById(
  id,
  auth.userId,
  auth.organizationId,
  auth.role,
  auth
);

export const authWithoutOrganizationRead = service => (id, auth) => service.getById(
  id,
  auth.userId,
  auth.role,
  auth
);

export function createEntityServiceBinder(registry, {
  resolveConstructionHandlers,
  buildProcessCapabilities,
  createProcessDelete,
  verifyProcessCapabilities
}) {
  return function bindEntityService(type, service, { list, read, constructions = {} } = {}) {
    if (!list) throw new Error(`Entity service ${type} requires an explicit processList binding`);
    if (!read) throw new Error(`Entity service ${type} requires an explicit processGetById binding`);
    const constructionHandlers = resolveConstructionHandlers(type, service, constructions);
    const processCapabilities = buildProcessCapabilities(type, constructionHandlers);
    const processDelete = processCapabilities.delete ? createProcessDelete(type, service, read) : null;
    verifyProcessCapabilities(type, service, constructionHandlers, processCapabilities, processDelete);
    registry.registerEntityService(type, { ...service, processList: list, processGetById: read, processDelete, processCapabilities, constructionHandlers });
  };
}
