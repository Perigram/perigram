/**
 * POST /api/queue/:id/mark-cut
 * Mark queue as CUT (requires chosen run)
 */

import * as queuesService from '~/server/features/queues/service';
import { requireAuth } from '~/server/utils/permissions';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const auth = event.context.auth;
  const queueId = event.context.params.id;
  
  const queue = await queuesService.markCut(
    queueId, 
    auth.userId,
    auth.organizationId,
    auth.role,
    auth.permissions
  );
  
  return { success: true, queue };
});
