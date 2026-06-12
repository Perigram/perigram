import * as queuesService from '../../../features/queues/service.js';
import { requireAuth } from '../../../utils/permissions.js';
import { serializeManyForAccess } from '../../../utils/entity-redaction.js';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const auth = event.context.auth;
  const id = event.context.params.id;
  
  const query = getQuery(event);
  const runId = query.runId;
  
  const artifacts = await queuesService.getArtifacts(
    id, 
    auth.userId,
    auth.organizationId,
    auth.role,
    auth,
    runId
  );
  return serializeManyForAccess('artifact', artifacts, auth);
});
