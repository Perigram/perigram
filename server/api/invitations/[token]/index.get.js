import { defineEventHandler } from 'h3';
import * as invitationService from '~/server/features/invitations/service';

export default defineEventHandler(async (event) => {
  const token = event.context.params.token;
  return await invitationService.getByToken(token);
});
