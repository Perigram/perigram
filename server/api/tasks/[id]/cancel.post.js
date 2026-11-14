import { readBody } from 'h3';
import { cancelTaskRun } from '~/server/core/tasks/service.js';
import { requireWorkerAccess, connectorWorkerType } from '~/server/core/tasks/worker-auth.js';

export default defineEventHandler(async (event) => {
  const scope = await requireWorkerAccess(event);
  const workerType = scope.scope === 'connector' ? connectorWorkerType(scope) : null;
  const body = await readBody(event);
  const run = await cancelTaskRun(event.context.params.id, body?.reason || 'Cancelled by worker API', { workerType });
  return { success: true, run };
});
