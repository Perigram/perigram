/**
 * POST /api/queue/:id/choose-run
 * Mark a completed run as chosen
 */

import * as nestingRunsService from '~/server/features/nesting-runs/service';
import { requireAuth } from '~/server/utils/permissions';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const auth = event.context.auth;
  const queueId = event.context.params.id;
  const body = await readBody(event);
  
  if (!body.runId) {
    throw createError({ statusCode: 400, message: 'runId is required' });
  }
  
  const run = await nestingRunsService.chooseRun(
    queueId,
    body.runId,
    auth.userId,
    auth.organizationId,
    auth.role,
    auth
  );

  return { success: true, run };
});
