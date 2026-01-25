import * as queuesService from '~/server/features/queues/service';
import { requireAuth } from '~/server/utils/permissions';

export default defineEventHandler(async (event) => {
  try {
    requireAuth(event);
    const auth = event.context.auth;
    const queueId = event.context.params.id;
    const runId = event.context.params.runId;
    
    return await queuesService.removeRun(
      queueId, 
      runId, 
      auth.userId,
      auth.organizationId,
      auth.role,
      auth
    );
  } catch (error) {
    console.error('Delete run error:', error);
    throw error;
  }
});
