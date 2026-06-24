import { defineEventHandler, getQuery } from 'h3';
import { requireAuth } from '../../utils/permissions.js';
import * as cassetteService from '../../features/cassettes/service.js';
import { serializeManyForAccess } from '../../utils/entity-redaction.js';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const auth = event.context.auth;
  const query = getQuery(event);
  
  const cassettes = await cassetteService.list(
    auth.userId,
    auth.organizationId,
    auth.role,
    auth,
    {
      status: query.status || query.primaryStatus,
      primaryStatuses: query.primaryStatuses,
      limit: query.limit ? parseInt(query.limit) : 100,
      skip: query.skip ? parseInt(query.skip) : 0
    }
  );
  return serializeManyForAccess('cassette', cassettes, auth);
});
