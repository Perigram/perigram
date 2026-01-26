import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as usersService from '~/server/features/users/service';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  return await usersService.list(auth.userId, auth.organizationId, auth.role, auth);
});
