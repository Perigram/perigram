import { requireAuth } from '~/server/utils/permissions';
import { getAppRegistry } from '~/server/runtime/app-registry.js';

// Generic instance read transport (SPEC §13): single instance by id through
// the same entity-service boundary the process evaluator uses.
export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const typeId = getRouterParam(event, 'type');
  const id = getRouterParam(event, 'id');
  if (!typeId || !id) {
    throw createError({ statusCode: 400, statusMessage: 'type and id are required' });
  }
  const registry = getAppRegistry();
  const service = registry.getInstanceService(typeId);
  if (!service?.processGetById) {
    throw createError({ statusCode: 404, statusMessage: `no instance service for type ${typeId}` });
  }
  const organizationId = auth.organizationId || auth.memberships?.[0]?.organizationId || null;
  const item = await service.processGetById(id, { auth, userId: auth.userId, organizationId });
  if (!item) {
    throw createError({ statusCode: 404, statusMessage: `${typeId} ${id} not found` });
  }
  return item;
});
