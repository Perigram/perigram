import { defineEventHandler } from 'h3';
import { requireAuth } from '../../../utils/permissions.js';
import * as usersService from '../../../features/users/service.js';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  return await usersService.removeAvatar(event.context.params.id, auth);
});
