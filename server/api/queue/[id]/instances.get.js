import { defineEventHandler } from 'h3';
import { requireAuth } from '../../../utils/permissions.js';
import * as cassetteInstanceService from '../../../features/cassette-instances/service.js';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const id = event.context.params.id;
  
  return await cassetteInstanceService.listByQueue(id, auth.userId, auth.organizationId, auth.role, auth);
});
