/**
 * POST /api/batch/:id/mark-cut
 * Mark batch as CUT (requires chosen run)
 */

import { service as batchService } from '~/server/features/batches';

export default defineEventHandler(async (event) => {
  const userId = event.context.auth.userId;
  const batchId = getRouterParam(event, 'id');
  
  const batch = await batchService.markCut(batchId, userId);
  
  return { success: true, batch };
});
