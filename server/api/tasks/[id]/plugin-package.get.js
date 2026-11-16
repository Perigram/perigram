import { createError, defineEventHandler, getQuery } from 'h3';
import { requireWorkerAccess } from '~/server/core/tasks/worker-auth.js';
import { getTaskRunById } from '~/server/core/tasks/service.js';
import * as pluginsService from '~/server/features/plugins/service.js';
import { PLUGIN_RUNTIME_WORKER_TYPE } from '#shared/plugin-runtime.js';

export default defineEventHandler(async event => {
  const scope = await requireWorkerAccess(event);
  if (scope.scope !== 'global') throw createError({ statusCode: 403, message: 'Managed package reads require the platform worker' });

  const runId = String(event.context.params.id || '');
  const run = await getTaskRunById(runId);
  const claimToken = String(getQuery(event).claimToken || '');
  if (!run || run.workerType !== PLUGIN_RUNTIME_WORKER_TYPE || run.status !== 'RUNNING'
    || !claimToken || run.claimToken !== claimToken) {
    throw createError({ statusCode: 409, message: 'A current managed runtime task claim is required' });
  }

  return await pluginsService.managedRuntimePackageForTask(run);
});
