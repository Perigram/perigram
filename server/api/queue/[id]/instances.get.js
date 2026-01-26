import { defineEventHandler } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as cassetteInstanceService from '~/server/features/cassette-instances/service';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const id = event.context.params.id;
  
  return await cassetteInstanceService.listByQueue(id, auth.userId, auth.organizationId, auth.role, auth);
});
