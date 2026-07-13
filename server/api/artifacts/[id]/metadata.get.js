import { defineEventHandler, getRouterParam } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import { serializeForAccess } from '~/server/utils/entity-redaction.js';
import { service } from '~/server/features/artifacts';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const artifact = await service.getById(getRouterParam(event, 'id'), auth.userId, auth.organizationId, auth.role, auth);
  return serializeForAccess('artifact', artifact, auth);
});
