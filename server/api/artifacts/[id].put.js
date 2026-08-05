import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import { serializeForAccess } from '~/server/utils/entity-redaction.js';
import { service } from '~/server/features/artifacts';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const artifact = await service.updateDetails(getRouterParam(event, 'id'), await readBody(event), auth);
  return serializeForAccess('artifact', artifact, auth);
});
