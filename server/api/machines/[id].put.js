import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { service } from '~/server/features/machines';
import { requireAuth } from '~/server/utils/permissions.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  return await service.update(
    getRouterParam(event, 'id'),
    await readBody(event),
    auth.userId,
    auth.organizationId,
    auth.role,
    auth
  );
});
