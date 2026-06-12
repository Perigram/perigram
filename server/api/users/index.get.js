import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '../../utils/permissions.js';
import * as usersService from '../../features/users/service.js';
import { serializeManyForAccess } from '../../utils/entity-redaction.js';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const users = await usersService.list(auth.userId, auth.organizationId, auth.role, auth);
  return serializeManyForAccess('user', users, auth);
});
