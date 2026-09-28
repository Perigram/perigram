import { defineEventHandler } from 'h3';
import { requireAuth } from '../../utils/permissions.js';
import * as invitationService from '../../features/invitations/service.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  return await invitationService.listMine(auth);
});
