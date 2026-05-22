import { readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import { executeCommand } from '~/server/core/commands/service.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const body = await readBody(event);
  const result = await executeCommand(event.context.params.id, body, createCommandAuth(auth, body.testAccess));
  return {
    success: true,
    result
  };
});

function createCommandAuth(auth, testAccess) {
  if (!testAccess?.enabled) return auth;
  const organizationId = testAccess.organizationId || auth.organizationId || auth.memberships?.[0]?.organizationId;
  if (!organizationId) return auth;

  const permissions = testAccess.permissions && typeof testAccess.permissions === 'object'
    ? testAccess.permissions
    : {};
  const memberships = (auth.memberships || []).filter(membership => membership.organizationId?.toString() !== organizationId.toString());

  return {
    ...auth,
    userId: testAccess.userId || auth.userId,
    organizationId,
    memberships: [
      ...memberships,
      { organizationId, permissions, status: 'active' }
    ],
    permissions
  };
}
