import * as cassetteService from '~/server/features/cassettes/service';
import { requireAuth } from '~/server/utils/permissions';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const auth = event.context.auth;
  const body = await readBody(event);
  
  return await cassetteService.create(
    body, 
    auth.userId,
    auth.organizationId,
    auth.role,
    auth.permissions
  );
});
