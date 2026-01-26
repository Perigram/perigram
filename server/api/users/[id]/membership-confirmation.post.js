import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as usersService from '~/server/features/users/service';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const userId = event.context.params.id;
  const body = await readBody(event);
  
  return await usersService.confirmMembership(userId, body.organizationId, body.action, auth);
});