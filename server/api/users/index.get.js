import { defineEventHandler } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as usersService from '~/server/features/users/service';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const auth = event.context.auth;
  
  return await usersService.list(auth.role, auth.organizationId);
});