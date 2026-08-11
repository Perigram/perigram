import { defineEventHandler, getRouterParam } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import { service } from '~/server/features/artifact-templates';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  await service.remove(getRouterParam(event, 'id'), auth.userId, auth.organizationId, auth.role, auth);
  return { success: true };
});
