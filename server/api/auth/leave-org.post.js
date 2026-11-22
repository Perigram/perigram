import { createError, defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as usersService from '~/server/features/users/service';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const body = await readBody(event);
  const organizationId = body?.organizationId;
  if (!organizationId) throw createError({ statusCode: 400, message: 'organizationId is required' });
  return await usersService.leaveOrganization(auth.userId, organizationId);
});
