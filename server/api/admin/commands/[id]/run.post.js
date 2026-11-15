import { createError, readBody } from 'h3';
import { requireLineagePermission } from '~/server/utils/permissions';
import { executeCommand } from '~/server/core/commands/service.js';

export default defineEventHandler(async (event) => {
  const auth = requireLineagePermission(event, { organizationId: event.context.auth?.organizationId }, 'organizations', 'admin');
  const body = await readBody(event);
  const result = await executeCommand(event.context.params.id, body, createCommandAuth(auth, body.testAccess));
  return {
    success: true,
    result
  };
});

function createCommandAuth(auth, testAccess) {
  if (!testAccess?.enabled) return auth;
  const organizationId = testAccess.organizationId || auth.organizationId;
  if (!organizationId || String(organizationId) !== String(auth.organizationId)) {
    throw createError({ statusCode: 403, message: 'Test access is limited to the active organization' });
  }

  const permissions = testAccess.permissions && typeof testAccess.permissions === 'object'
    ? testAccess.permissions
    : {};

  return {
    ...auth,
    userId: testAccess.userId || auth.userId,
    organizationId,
    role: testAccess.role || auth.role,
    memberships: [
      { organizationId, permissions, status: 'active' }
    ],
    permissions,
    restrictedTo: testAccess.restrictedTo || auth.restrictedTo
  };
}
