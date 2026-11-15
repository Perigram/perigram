import { defineEventHandler, readBody } from 'h3';
import { requireLineagePermission } from '~/server/utils/permissions.js';
import * as usersService from '~/server/features/users/service';

export default defineEventHandler(async (event) => {
  const auth = requireLineagePermission(event, { organizationId: event.context.auth?.organizationId }, 'users', 'admin');
  const body = await readBody(event);
  
  return await usersService.register(body, auth);
});
