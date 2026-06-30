import { service } from '~/server/features/profile-templates';
import { requireAuth } from '~/server/utils/permissions.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const body = await readBody(event);
  return await service.create(body, auth);
});
