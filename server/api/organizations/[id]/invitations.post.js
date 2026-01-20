import { defineEventHandler, readBody } from 'h3';
import { requirePermission } from '~/server/utils/permissions';
import * as invitationService from '~/server/features/invitations/service';

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'users', 'admin');
  const id = event.context.params.id;
  const body = await readBody(event);
  
  return await invitationService.generateInvitation(id, body.role, user);
});
