import { defineEventHandler } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as usersService from '~/server/features/users/service';

export default defineEventHandler(async (event) => {
  const auth = event.context.auth;
  requireAuth(event);
  
  const id = event.context.params.id;
  
  // Note: Only SuperAdmins or Organization Admins (of the user's org) should be able to delete users
  // This logic is inside the service
  return await usersService.remove(id, auth.userId, auth.organizationId, auth.role, auth);
});
