import { defineEventHandler } from 'h3';
import { requirePermission } from '~/server/utils/permissions';
import { service as invitationsService } from '~/server/features/invitations/index.js';

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'users', 'read');
  const id = event.context.params.id;
  
  return await invitationsService.listByOrg(id);
});