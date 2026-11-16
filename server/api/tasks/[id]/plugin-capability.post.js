import { createError, defineEventHandler, readBody } from 'h3';
import { requireWorkerAccess } from '~/server/core/tasks/worker-auth.js';
import { getTaskRunById } from '~/server/core/tasks/service.js';
import * as pluginRepository from '~/server/features/plugins/repository.js';
import * as graphExecutionsService from '~/server/features/graph-executions/service.js';
import * as filesService from '~/server/features/files/service.js';
import { getAppRegistry } from '~/server/runtime/app-registry.js';
import { PLUGIN_RUNTIME_WORKER_TYPE, PLUGIN_RUNTIME_CAPABILITIES } from '#shared/plugin-runtime.js';

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
  const install = await pluginRepository.findInstall(organizationId, String(taskInput.pluginId || ''));
  if (!install || String(install.version) !== String(taskInput.version || '')) {
    throw createError({ statusCode: 409, message: 'The installed plugin version changed during execution' });
  }
  const service = (install.services || []).find(item => item.id === String(taskInput.operationId || ''));
  const name = String(body.name || '');
  const declared = new Set(service?.execution?.capabilities || []);
  if (!service?.execution || !declared.has(name) || !PLUGIN_RUNTIME_CAPABILITIES.includes(name)) {
    throw createError({ statusCode: 403, message: `Capability ${name || '(empty)'} is not granted to this operation` });
  }

  const input = body.input ?? {};
  if (name === 'organization.instances.query') {
    return await graphExecutionsService.queryOrganizationData(input, run.auth || {});
  }
  if (name === 'organization.instances.read') {
    const typeId = String(input.typeId || '');
    const instanceId = String(input.instanceId || '');
    if (!typeId || !instanceId) throw createError({ statusCode: 400, message: 'Instance reads require typeId and instanceId' });
    const serviceForType = getAppRegistry().getInstanceService(typeId);
    if (typeof serviceForType?.processGetById !== 'function') {
      throw createError({ statusCode: 404, message: 'Instance read service is unavailable' });
    }
    const instance = await serviceForType.processGetById(instanceId, run.auth || {});
    if (!instance) throw createError({ statusCode: 404, message: 'Instance not found' });
    return instance;
  }
  if (name === 'files.read') {
    const fileId = String(input.fileId || '');
    const bucket = String(input.bucket || 'files');
    if (!fileId) throw createError({ statusCode: 400, message: 'File reads require fileId' });
    const meta = await filesService.findFileMeta(fileId, bucket);
    if (!meta) throw createError({ statusCode: 404, message: 'File not found' });
    filesService.assertFileReadAccess(meta.metadata, run.auth || {});
    const buffer = await filesService.getFileBuffer(fileId, bucket);
    return {
      fileId,
      name: meta.filename,
      mime: meta.contentType,
      size: meta.length,
      base64: buffer.toString('base64')
    };
  }
  throw createError({ statusCode: 501, message: `Capability ${name} has no host adapter yet` });
});
