import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as invitationService from '~/server/features/invitations/service';

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event);
  const body = await readBody(event);
  
  if (!body.code) {
    throw createError({ statusCode: 400, message: 'Invitation code is required' });
  }
  
  return await invitationService.joinByCode(body.code, user);
});
