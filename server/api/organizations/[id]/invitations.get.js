import { defineEventHandler } from 'h3';
import { requirePermission } from '~/server/utils/permissions';
import * as invitationRepository from '~/server/features/invitations/repository';

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'users', 'read');
  const id = event.context.params.id;
  
  return await invitationRepository.findByOrg(id);
});