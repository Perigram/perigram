import { createError, defineEventHandler, getRouterParam } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import { getAppRegistry } from '~/server/runtime/app-registry.js';

// Generic instance remove transport: the record death behind the same
// write gate the patch transport takes (the service's removeForHttp
// loads the entity and checks the compiled grant — fail-closed).
export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const typeId = getRouterParam(event, 'type');
  const id = getRouterParam(event, 'id');
  if (!typeId || !id) {
    throw createError({ statusCode: 400, statusMessage: 'type and id are required' });
  }
  const service = getAppRegistry().getInstanceService(typeId);
  if (!service || typeof service.removeForHttp !== 'function') {
    throw createError({ statusCode: 404, statusMessage: `no instance service for type ${typeId}` });
  }
  const organizationId = auth.organizationId || auth.memberships?.[0]?.organizationId || null;
  return await service.removeForHttp(id, { auth, organizationId });
});
