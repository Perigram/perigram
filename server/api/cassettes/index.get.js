import { defineEventHandler, getQuery } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as cassetteService from '~/server/features/cassettes/service';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const auth = event.context.auth;
  const query = getQuery(event);
  
  return await cassetteService.list(
    auth.userId,
    auth.organizationId,
    auth.role,
    auth,
    {
      status: query.status,
      limit: query.limit ? parseInt(query.limit) : 100,
      skip: query.skip ? parseInt(query.skip) : 0
    }
  );
});