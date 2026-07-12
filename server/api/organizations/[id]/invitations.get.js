import { defineEventHandler } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import { service as invitationsService } from '~/server/features/invitations/index.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const id = event.context.params.id;
  
  return await invitationsService.listByOrgForUser(id, auth);
});
