import { createError, defineEventHandler, getRouterParam, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import { getAppRegistry } from '~/server/runtime/app-registry.js';

// Generic instance create transport: the POST half of the §3 wire the
// update transport patches. The service owns the draft mapping and the
// access gate (a write requires a compiled grant — fail-closed).
// Framework feature types keep their own create routes; they expose no
// createForHttp and 404 here.
export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const typeId = getRouterParam(event, 'type');
  if (!typeId) {
    throw createError({ statusCode: 400, statusMessage: 'type is required' });
  }
  const service = getAppRegistry().getInstanceService(typeId);
  if (!service || typeof service.createForHttp !== 'function') {
    throw createError({ statusCode: 404, statusMessage: `no instance service for type ${typeId}` });
  }
  const body = await readBody(event);
  const organizationId = auth.organizationId || auth.memberships?.[0]?.organizationId || null;
  return await service.createForHttp(body || {}, { auth, organizationId });
});
