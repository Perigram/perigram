/**
 * POST /api/queue/:id/reset-status
 * Reset queue status to DRAFT (for debugging stuck queues)
 */

import * as queuesService from '~/server/features/queues/service';
import { requireAuth } from '~/server/utils/permissions';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const auth = event.context.auth;
  const queueId = event.context.params.id;
  
  const queue = await queuesService.resetToDraft(
    queueId, 
    auth.userId,
    auth.organizationId,
    auth.role,
    auth
  );
  
  return { success: true, status: queue.status, queue };
});
