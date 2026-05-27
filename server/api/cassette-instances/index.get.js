import { defineEventHandler, getQuery } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as instanceService from '~/server/features/cassette-instances/service';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const query = getQuery(event);
  const queueId = query['lineage.queueId'] || query.queueId;

  if (queueId) {
    return await instanceService.listByQueue(
      queueId,
      auth.userId,
      auth.organizationId,
      auth.role,
      auth
    );
  }

  return await instanceService.list(
    auth.userId,
    auth.organizationId,
    auth.role,
    auth,
    query
  );
});
