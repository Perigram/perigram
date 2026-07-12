import { defineEventHandler } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as invitationService from '~/server/features/invitations/service';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const organizationId = event.context.params.id;
  const invId = event.context.params.invId;
  
  return await invitationService.revokeInvitation(organizationId, invId, auth);
});
