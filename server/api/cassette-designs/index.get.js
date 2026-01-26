import { defineEventHandler, getQuery } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as designService from '~/server/features/cassette-designs/service';

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
