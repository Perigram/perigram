/**
 * POST /api/queue/:id/choose-run
 * Mark a completed run as chosen
 */

import * as queuesService from '~/server/features/queues/service';
import { requireAuth } from '~/server/utils/permissions';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const auth = event.context.auth;
  const queueId = event.context.params.id;
  const body = await readBody(event);
  
  if (!body.runId) {
    throw createError({ statusCode: 400, message: 'runId is required' });
  }
  
  const queue = await queuesService.chooseRun(
    queueId, 
    body.runId, 
    auth.userId,
    auth.organizationId,
    auth.role,
    auth.permissions
  );
  
  return { success: true, queue };
});
