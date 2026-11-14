import { readBody } from 'h3';
import { heartbeatTaskRun } from '~/server/core/tasks/service.js';
import { requireWorkerAccess, connectorWorkerType } from '~/server/core/tasks/worker-auth.js';

export default defineEventHandler(async (event) => {
  const scope = await requireWorkerAccess(event);
  const workerType = scope.scope === 'connector' ? connectorWorkerType(scope) : null;
  const body = await readBody(event);
  const run = await heartbeatTaskRun(event.context.params.id, body?.claimToken, { leaseMs: body?.leaseMs || 60000, workerType });
  return { success: true, run };
});
