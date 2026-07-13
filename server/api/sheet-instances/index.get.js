import { defineEventHandler, getQuery } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import { service } from '~/server/features/sheet-instances';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  return await service.list(auth.userId, auth.organizationId, auth.role, auth, getQuery(event));
});
