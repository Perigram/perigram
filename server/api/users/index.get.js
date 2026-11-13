import { defineEventHandler } from 'h3';
import { requireAuth } from '../../utils/permissions.js';
import * as usersService from '../../features/users/service.js';
import { serializeManyForAccess } from '../../utils/entity-redaction.js';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const users = await usersService.list(auth);
  const responseAuth = await usersService.canManageUsersInOrganization(auth, auth.organizationId)
    ? withUsersAdmin(auth)
    : auth;
  return serializeManyForAccess('user', users, responseAuth);
});

function withUsersAdmin(auth = {}) {
  return {
    ...auth,
    effectivePermissions: {
      ...(auth.effectivePermissions || auth.permissions || {}),
      users: 'admin'
    }
  };
}
