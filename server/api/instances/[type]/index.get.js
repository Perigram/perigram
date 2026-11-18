import { requireAuth } from '~/server/utils/permissions';
import { getAppRegistry } from '~/server/runtime/app-registry.js';

// Generic instance list transport (SPEC §13): the HTTP surface the legacy
// entity API deletion left missing. One route serves every type that
// resolves through the generic instance services; explicit framework
// services keep their feature-owned routes.
export async function listInstancesForType(event, typeId) {
  const auth = requireAuth(event);
  if (!typeId) {
    throw createError({ statusCode: 400, statusMessage: 'type is required' });
  }
  const service = getAppRegistry().getInstanceService(typeId);
  if (!service?.processList) {
    throw createError({ statusCode: 404, statusMessage: `no instance service for type ${typeId}` });
  }
  // processList owns declaration resolution, the write-grant target, and
  // per-item read filtering; it needs the real auth context to see the
  // effective grants.
  return await service.processList(getQuery(event), auth);
}

export default defineEventHandler(event => listInstancesForType(event, getRouterParam(event, 'type')));
