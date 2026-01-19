/**
 * POST /api/batch/:id/choose-run
 * Mark a completed run as chosen
 */

import { service as batchService } from '~/server/features/batches';

export default defineEventHandler(async (event) => {
  const userId = event.context.auth.userId;
  const batchId = getRouterParam(event, 'id');
  const body = await readBody(event);
  
  if (!body.runId) {
    throw createError({ statusCode: 400, message: 'runId is required' });
  }
  
  const batch = await batchService.chooseRun(batchId, body.runId, userId);
  
  return { success: true, batch };
});
