import { readBody } from 'h3';
import { completeTaskRun } from '~/server/core/tasks/service.js';
import { requireWorkerAccess } from '~/server/core/tasks/worker-auth.js';

export default defineEventHandler(async (event) => {
  await requireWorkerAccess(event);
  const body = await readBody(event);
  const run = await completeTaskRun(event.context.params.id, body?.result || {}, body?.claimToken || null);
  return { success: true, run };
});
