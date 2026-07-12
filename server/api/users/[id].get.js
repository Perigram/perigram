import { createError, defineEventHandler } from 'h3';
import { requireAuth } from '../../utils/permissions.js';
import * as usersService from '../../features/users/service.js';
import { serializeForAccess } from '../../utils/entity-redaction.js';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const targetId = event.context.params.id;
  const user = await usersService.getById(targetId);
  if (!user) throw createError({ statusCode: 404, message: 'User not found' });

  const sameUser = user.id?.toString?.() === auth.userId?.toString?.();
  const canManage = await usersService.canManageUsersInOrganization(auth, auth.organizationId);
  const responseAuth = sameUser || canManage ? withUsersAdmin(auth) : auth;
  return serializeForAccess('user', user, responseAuth);
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
