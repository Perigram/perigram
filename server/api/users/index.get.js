import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '../../utils/permissions.js';
import * as usersService from '../../features/users/service.js';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const users = await usersService.list(auth.userId, auth.organizationId, auth.role, auth);
  return users.map(u => u.toJSON ? u.toJSON() : u);
});
