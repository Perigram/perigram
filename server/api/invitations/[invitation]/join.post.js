import { defineEventHandler } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as invitationService from '~/server/features/invitations/service';

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event);
  const token = event.context.params.invitation;
  
  return await invitationService.joinByToken(token, user);
});
