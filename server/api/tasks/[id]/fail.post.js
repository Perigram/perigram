import { readBody } from 'h3';
import { failTaskRun } from '~/server/core/tasks/service.js';
import { requireWorkerAccess } from '~/server/core/tasks/worker-auth.js';

export default defineEventHandler(async (event) => {
  await requireWorkerAccess(event);
  const body = await readBody(event);
  const run = await failTaskRun(event.context.params.id, new Error(body?.message || 'Task failed'), body?.claimToken || null);
  return { success: true, run };
});
