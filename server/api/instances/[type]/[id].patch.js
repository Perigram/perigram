import { createError, defineEventHandler, getRouterParam, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import { getAppRegistry } from '~/server/runtime/app-registry.js';

// Generic instance update transport: the generic instance service writes
// the name and declared flat fields through its access and revision gates.
// Structural lineage/relation changes use their dedicated validated routes.
export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const typeId = getRouterParam(event, 'type');
  const id = getRouterParam(event, 'id');
  if (!typeId || !id) {
    throw createError({ statusCode: 400, statusMessage: 'type and id are required' });
  }
  const service = getAppRegistry().getInstanceService(typeId);
  if (!service || typeof service.patch !== 'function') {
    throw createError({ statusCode: 404, statusMessage: `no instance service for type ${typeId}` });
  }
  const body = await readBody(event);
  const organizationId = auth.organizationId || auth.memberships?.[0]?.organizationId || null;
  return await service.patch(id, body || {}, { auth, organizationId });
});
