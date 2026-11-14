import { readBody } from 'h3';
import { failTaskRun } from '~/server/core/tasks/service.js';
import { requireWorkerAccess, connectorWorkerType } from '~/server/core/tasks/worker-auth.js';

export default defineEventHandler(async (event) => {
  const scope = await requireWorkerAccess(event);
  const workerType = scope.scope === 'connector' ? connectorWorkerType(scope) : null;
  const body = await readBody(event);
  const run = await failTaskRun(event.context.params.id, new Error(body?.message || 'Task failed'), body?.claimToken || null, { workerType });
  return { success: true, run };
});
