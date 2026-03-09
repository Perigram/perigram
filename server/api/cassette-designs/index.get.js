import { defineEventHandler, getQuery } from 'h3';
import { requireAuth } from '../../utils/permissions.js';
import * as designService from '../../features/cassette-designs/service.js';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const query = getQuery(event);
  
  return await designService.list(
    auth.userId,
    auth.organizationId,
    auth.role,
    auth,
    query
  );
});
