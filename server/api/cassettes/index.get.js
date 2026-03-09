import { defineEventHandler, getQuery } from 'h3';
import { requireAuth } from '../../utils/permissions.js';
import * as cassetteService from '../../features/cassettes/service.js';

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