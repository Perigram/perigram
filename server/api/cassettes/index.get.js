import * as cassetteService from '~/server/features/cassettes/service';
import { requireAuth } from '~/server/utils/permissions';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const auth = event.context.auth;
  const query = getQuery(event);
  
  return await cassetteService.listForUser(
    auth.userId,
    auth.organizationId,
    auth.role,
    auth.permissions,
    {
      status: query.status,
      limit: query.limit ? parseInt(query.limit) : 100,
      skip: query.skip ? parseInt(query.skip) : 0
    }
  );
});
