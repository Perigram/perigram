/**
 * POST /api/queue/:id/mark-cut
 * Mark queue as CUT (requires chosen run)
 */

import * as queuesService from '../../../features/queues/service.js';
import { requireAuth } from '../../../utils/permissions.js';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const auth = event.context.auth;
  const queueId = event.context.params.id;
  
  const queue = await queuesService.markCut(
    queueId, 
    auth.userId,
    auth.organizationId,
    auth.role,
    auth
  );
  
  return { success: true, queue };
});
