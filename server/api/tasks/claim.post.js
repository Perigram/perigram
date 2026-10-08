import { createError, defineEventHandler, readBody } from 'h3';
import { claimTask } from '~/server/core/tasks/service.js';
import { requireWorkerAccess, connectorWorkerType } from '~/server/core/tasks/worker-auth.js';

export default defineEventHandler(async (event) => {
  const scope = await requireWorkerAccess(event);
  const body = await readBody(event);
  if (scope.scope === 'connector') {
    // Connector tokens see one queue only: their install's plugin runs
    // for their organization. Explicit task targeting stays a global
    // worker capability.
    if (body?.taskId) {
      throw createError({ statusCode: 403, message: 'Connector tokens claim by queue, not by task id' });
    }
    const run = await claimTask({
      workerType: connectorWorkerType(scope),
      workerId: body?.workerId || 'worker',
      leaseMs: body?.leaseMs || 60000
    });
    return { success: true, run };
  }
  const run = await claimTask({
    taskId: body?.taskId || null,
    workerType: body?.workerType || null,
    workerId: body?.workerId || 'worker',
    leaseMs: body?.leaseMs || 60000
  });
  return { success: true, run };
});
