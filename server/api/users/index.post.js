import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as usersService from '~/server/features/users/service';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const auth = event.context.auth;
  
  const body = await readBody(event);
  return await usersService.register(body, auth.userId, auth.role);
});