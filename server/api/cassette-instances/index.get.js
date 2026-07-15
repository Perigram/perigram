import { defineEventHandler, getQuery } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import { serializeManyForAccess } from '~/server/utils/entity-redaction.js';
import * as instanceService from '~/server/features/cassette-instances/service';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const query = getQuery(event);
  const queueId = query['lineage.queue.entityId'] || query.queueId;

  if (queueId) {
    const instances = await instanceService.listByQueue(
      queueId,
      auth.userId,
      auth.organizationId,
      auth.role,
      auth
    );
    return serializeManyForAccess('cassetteInstance', instances, auth);
  }

  const instances = await instanceService.list(
    auth.userId,
    auth.organizationId,
    auth.role,
    auth,
    query
  );
  return serializeManyForAccess('cassetteInstance', instances, auth);
});
