import * as cassetteService from '~/server/features/cassettes/service';
import { requireAuth } from '~/server/utils/permissions';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const auth = event.context.auth;
  const id = event.context.params.id;
  
  return await cassetteService.getById(
    id, 
    auth.userId,
    auth.organizationId,
    auth.role,
    auth.permissions
  );
});
