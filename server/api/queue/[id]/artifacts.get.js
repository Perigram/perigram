import * as queuesService from '~/server/features/queues/service';
import { requireAuth } from '~/server/utils/permissions';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const auth = event.context.auth;
  const id = event.context.params.id;
  
  const query = getQuery(event);
  return await queuesService.getArtifacts(
    id, 
    auth.userId,
    auth.organizationId,
    auth.role,
    auth.permissions,
    { runId: query.runId }
  );
});
