import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '../../../utils/permissions.js';
import * as invitationService from '../../../features/invitations/service.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const id = event.context.params.invitation;
  const body = await readBody(event);
  return await invitationService.respondInvitation(id, auth, body?.action || 'accept');
});
