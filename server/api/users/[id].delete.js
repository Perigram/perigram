import { defineEventHandler } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as usersService from '~/server/features/users/service';

export default defineEventHandler(async (event) => {
  const auth = event.context.auth;
  requireAuth(event);
  
  const id = event.context.params.id;
  
  return await usersService.remove(id, auth);
});
