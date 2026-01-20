import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as usersService from '~/server/features/users/service';

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event);
  const body = await readBody(event);
  
  if (!body.organizationId) {
    throw createError({ statusCode: 400, message: 'Organization ID is required' });
  }
  
  return await usersService.switchOrganization(user.userId, body.organizationId);
});
