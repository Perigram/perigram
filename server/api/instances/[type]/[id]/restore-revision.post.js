import { createError, defineEventHandler, getRouterParam, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import { getAppRegistry } from '~/server/runtime/app-registry.js';

// Revision restore transport (SPEC §24): a prior revision's frozen bytes
// re-enter through the revisioned payload channel as a new revision. The
// service owns the ownership check, trait validation, revisioning, and
// the access gate.
export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const typeId = getRouterParam(event, 'type');
  const id = getRouterParam(event, 'id');
  if (!typeId || !id) {
    throw createError({ statusCode: 400, statusMessage: 'type and id are required' });
  }
  const service = getAppRegistry().getInstanceService(typeId);
  if (!service || typeof service.restorePayloadRevision !== 'function') {
    throw createError({ statusCode: 404, statusMessage: `no instance service for type ${typeId}` });
  }
  const body = await readBody(event);
  if (!body?.revisionId) {
    throw createError({ statusCode: 400, statusMessage: 'revisionId is required' });
  }
  const organizationId = auth.organizationId || auth.memberships?.[0]?.organizationId || null;
  return await service.restorePayloadRevision(id, String(body.revisionId), {
    auth,
    userId: auth.userId,
    organizationId
  });
});
