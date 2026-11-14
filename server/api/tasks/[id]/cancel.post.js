import { createError, readBody } from 'h3';
import { cancelTaskRun } from '~/server/core/tasks/service.js';
import { requireWorkerAccess, connectorWorkerType } from '~/server/core/tasks/worker-auth.js';

export default defineEventHandler(async (event) => {
  const scope = await requireWorkerAccess(event);
  // Cancellation is an operator capability, not part of the connector
  // protocol (connectorInfo deliberately exposes no cancel endpoint).
  if (scope.scope === 'connector') {
    throw createError({ statusCode: 403, message: 'Connector tokens cannot cancel task runs' });
  }
  const workerType = null;
  const body = await readBody(event);
  const run = await cancelTaskRun(event.context.params.id, body?.reason || 'Cancelled by worker API', { workerType });
  return { success: true, run };
});
