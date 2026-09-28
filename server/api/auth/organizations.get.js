import { defineEventHandler } from 'h3';
import { requireAuth } from '../../utils/permissions.js';
import { service as usersService } from '../../features/users/index.js';
import { service as organizationsService } from '../../features/organizations/index.js';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);

  const user = await usersService.getById(auth.userId);
  // The organizations the account can switch into: explicit memberships
  // plus the lineage tenancy slot (older/owner accounts carry their org
  // link there — an empty memberships list must not hide the active org
  // from the account surfaces).
  const orgIds = [
    ...((user && Array.isArray(user.memberships) ? user.memberships : [])
      .map(m => m.organizationId)
      .filter(Boolean)),
    ...(user?.lineage?.organizationId ? [user.lineage.organizationId] : [])
  ];
  const uniqueOrgIds = [...new Set(orgIds.map(id => String(id)))];
  if (!uniqueOrgIds.length) return [];

  return await organizationsService.getByIds(uniqueOrgIds);
});
