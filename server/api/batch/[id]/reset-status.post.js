/**
 * POST /api/batch/:id/reset-status
 * Reset batch status to DRAFT (for debugging stuck batches)
 */

import { service as batchService } from '~/server/features/batches';

export default defineEventHandler(async (event) => {
  const userId = event.context.auth.userId;
  const batchId = getRouterParam(event, 'id');
  
  await batchService.updateStatus(batchId, 'DRAFT', userId);
  
  return { success: true, status: 'DRAFT' };
});
