import * as nestingRunsService from '~/server/features/nesting-runs/service';
import { requireAuth } from '~/server/utils/permissions';

export default defineEventHandler(async (event) => {
  try {
    requireAuth(event);
    const auth = event.context.auth;
    const queueId = event.context.params.id;
    const runId = event.context.params.runId;
    
    return await nestingRunsService.remove(
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
