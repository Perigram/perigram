import { createError, defineEventHandler, readBody } from 'h3';
import { requireWorkerAccess } from '~/server/core/tasks/worker-auth.js';
import { getTaskRunById } from '~/server/core/tasks/service.js';
import * as processDefinitionsService from '~/server/features/process-definitions/service.js';
import { invokePluginCapability } from '~/server/features/plugins/capabilities.js';
import { PLUGIN_RUNTIME_WORKER_TYPE } from '#shared/plugin-runtime.js';

export default defineEventHandler(async event => {
  const scope = await requireWorkerAccess(event);
  if (scope.scope !== 'global') throw createError({ statusCode: 403, message: 'Managed capabilities require the platform worker' });

  const run = await getTaskRunById(String(event.context.params.id || ''));
  const body = await readBody(event) || {};
  if (!run || run.workerType !== PLUGIN_RUNTIME_WORKER_TYPE || run.status !== 'RUNNING'
    || !body.claimToken || run.claimToken !== body.claimToken) {
    throw createError({ statusCode: 409, message: 'A current managed runtime task claim is required' });
  }

  const taskInput = run.input?.parameters?.value || {};
  const organizationId = String(run.auth?.organizationId || '');
  const auth = await processDefinitionsService.resolveRunActor(run.auth || {}, organizationId);
  return await invokePluginCapability({
    organizationId,
    pluginId: taskInput.pluginId,
    version: taskInput.version,
    runtimeId: taskInput.runtimeId,
    operationId: taskInput.operationId,
    name: body.name,
    input: body.input,
    target: 'server',
    auth,
    taskRun: { id: run._id, claimToken: body.claimToken }
  });
});
