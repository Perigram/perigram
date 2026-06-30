import { service } from '~/server/features/profile-templates';
import { requireAuth } from '~/server/utils/permissions.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  return await service.listAll(auth, getQuery(event));
});
