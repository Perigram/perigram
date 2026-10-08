import { readBody } from 'h3';
import { cancelTaskRun } from '~/server/core/tasks/service.js';
import { requireWorkerAccess } from '~/server/core/tasks/worker-auth.js';

export default defineEventHandler(async (event) => {
  await requireWorkerAccess(event);
  const body = await readBody(event);
  const run = await cancelTaskRun(event.context.params.id, body?.reason || 'Cancelled by worker API');
  return { success: true, run };
});
