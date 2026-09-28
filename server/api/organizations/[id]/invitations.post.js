import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as invitationService from '~/server/features/invitations/service';

export default defineEventHandler(async (event) => {
  const user = requireAuth(event);
  const id = event.context.params.id;
  const body = await readBody(event);

  return await invitationService.generateInvitation(id, body.roleIds, user, {
    inviteeUserId: body.inviteeUserId || null
  });
});
