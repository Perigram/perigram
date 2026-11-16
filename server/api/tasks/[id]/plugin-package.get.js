import { createError, defineEventHandler, getQuery } from 'h3';
import { requireWorkerAccess } from '~/server/core/tasks/worker-auth.js';
import { getTaskRunById } from '~/server/core/tasks/service.js';
import * as pluginRepository from '~/server/features/plugins/repository.js';
import { PLUGIN_RUNTIME_WORKER_TYPE } from '#shared/plugin-runtime.js';
import * as processDefinitionsService from '~/server/features/process-definitions/service.js';

export default defineEventHandler(async event => {
  const scope = await requireWorkerAccess(event);
  if (scope.scope !== 'global') throw createError({ statusCode: 403, message: 'Managed package reads require the platform worker' });

  const runId = String(event.context.params.id || '');
  const run = await getTaskRunById(runId);
  const claimToken = String(getQuery(event).claimToken || '');
  if (!run || run.workerType !== PLUGIN_RUNTIME_WORKER_TYPE || run.status !== 'RUNNING' || !claimToken || run.claimToken !== claimToken) {
    throw createError({ statusCode: 409, message: 'A current managed runtime task claim is required' });
  }

  const taskInput = run.input?.parameters?.value || {};
  const organizationId = String(run.auth?.organizationId || '');
  const pluginId = String(taskInput.pluginId || '');
  const version = String(taskInput.version || '');
  const runtimeId = String(taskInput.runtimeId || '');
  const operationId = String(taskInput.operationId || '');
  if (!organizationId || !pluginId || !version || !runtimeId || !operationId) {
    throw createError({ statusCode: 400, message: 'Managed runtime task package identity is incomplete' });
  }

  await processDefinitionsService.resolveRunActor(run.auth || {}, organizationId);
  const install = await pluginRepository.findInstall(organizationId, pluginId);
  if (!install || String(install.version) !== version) {
    throw createError({ statusCode: 409, message: 'The installed plugin version changed before execution' });
  }
  if (String(run.taskId) !== `plugin.${pluginId}.${operationId}`) {
    throw createError({ statusCode: 403, message: 'Managed runtime task identity does not match its package input' });
  }
  const service = (install.services || []).find(item => item.id === operationId);
  const runtime = (install.declarations?.runtimes || []).find(item => item.id === runtimeId);
  if (!service?.execution || service.execution.runtime !== runtimeId
    || !service.execution.targets?.includes('server')
    || !runtime?.targets?.includes('server')
    || runtime.language !== 'javascript') {
    throw createError({ statusCode: 409, message: 'Managed runtime declaration changed or is unsupported' });
  }

  const manifest = install.packageAssets?.assets || [];
  if (!manifest.length) throw createError({ statusCode: 409, message: 'Installed package assets are unavailable; reinstall or upgrade this plugin' });
  const assets = [];
  for (const item of manifest) {
    const path = String(item.path || '');
    if (!path || path.startsWith('/') || path.split('/').includes('..')) {
      throw createError({ statusCode: 500, message: 'Installed package asset manifest contains an unsafe path' });
    }
    const meta = await pluginRepository.findOrganizationPluginAssetMeta(organizationId, pluginId, version, path);
    if (!meta) throw createError({ statusCode: 409, message: `Installed package asset ${path} is missing` });
    const buffer = await pluginRepository.readOrganizationPluginAsset(meta);
    assets.push({
      path,
      contentType: meta.contentType || '',
      contentHash: meta.contentHash || item.contentHash || '',
      base64: buffer.toString('base64')
    });
  }

  const entry = String(runtime.entry || '').replace(/^\//, '');
  if (!assets.some(asset => asset.path === entry)) {
    throw createError({ statusCode: 409, message: `Runtime entry ${runtime.entry} is missing from installed package assets` });
  }
  return {
    success: true,
    package: {
      pluginId,
      version,
      runtime: { ...runtime },
      execution: { ...service.execution },
      operationId,
      input: taskInput.input ?? null,
      dependencies: install.declarations?.dependencies || [],
      assets
    }
  };
});
