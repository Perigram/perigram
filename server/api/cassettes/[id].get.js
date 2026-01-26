import { defineEventHandler } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as cassetteService from '~/server/features/cassettes/service';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const id = event.context.params.id;
  
  return await cassetteService.getById(
    id,
    auth.userId,
    auth.organizationId,
    auth.role,
    auth
  );
});