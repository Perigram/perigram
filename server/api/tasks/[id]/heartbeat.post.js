import { readBody } from 'h3';
import { heartbeatTaskRun } from '~/server/core/tasks/service.js';
import { requireWorkerAccess } from '~/server/core/tasks/worker-auth.js';

export default defineEventHandler(async (event) => {
  await requireWorkerAccess(event);
  const body = await readBody(event);
  const run = await heartbeatTaskRun(event.context.params.id, body?.claimToken, { leaseMs: body?.leaseMs || 60000 });
  return { success: true, run };
});
