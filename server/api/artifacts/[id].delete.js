import { service } from '~/server/features/artifacts';
import { requireAuth } from '~/server/utils/permissions.js';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const id = getRouterParam(event, 'id');
  return await service.remove(id, auth.userId, auth.organizationId, auth.role, auth);
});
