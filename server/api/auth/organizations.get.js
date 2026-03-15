import { defineEventHandler } from 'h3';
import { requireAuth } from '../../utils/permissions.js';
import { service as usersService } from '../../features/users/index.js';
import { service as organizationsService } from '../../features/organizations/index.js';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);

  const user = await usersService.getById(auth.userId);
  if (!user || !user.memberships || user.memberships.length === 0) return [];

  const orgIds = user.memberships
    .map(m => m.organizationId)
    .filter(Boolean);

  return await organizationsService.getByIds(orgIds);
});
