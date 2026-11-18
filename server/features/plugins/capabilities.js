import { createError } from 'h3';
import * as repository from './repository.js';
import * as graphExecutionsService from '../graph-executions/service.js';
import * as filesService from '../files/service.js';
import { getAppRegistry } from '../../runtime/app-registry.js';
import {
  PLUGIN_RUNTIME_CAPABILITIES,
  PLUGIN_RUNTIME_BROWSER_CAPABILITIES
} from '#shared/plugin-runtime.js';

export async function invokePluginCapability({
  organizationId, pluginId, version, runtimeId, operationId,
  name, input = {}, target, auth = {}
} = {}) {
  if (!['browser', 'server'].includes(target)) {
    throw createError({ statusCode: 400, message: 'Plugin capability target must be browser or server' });
  }
  const orgId = String(organizationId || '');
  if (!auth.userId && auth.system !== true) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }
  if (!orgId || String(auth.organizationId || '') !== orgId) {
    throw createError({ statusCode: 403, message: 'Active organization does not match plugin capability scope' });
  }

  const install = await repository.findInstall(orgId, String(pluginId || ''));
  if (!install || String(install.version) !== String(version || '')) {
    throw createError({ statusCode: 409, message: 'Installed plugin version changed during execution' });
  }
  const service = (install.services || []).find(item => item.id === String(operationId || ''));
  const runtime = (install.declarations?.runtimes || []).find(item => item.id === String(runtimeId || ''));
  const allowed = target === 'browser' ? PLUGIN_RUNTIME_BROWSER_CAPABILITIES : PLUGIN_RUNTIME_CAPABILITIES;
  if (!service?.execution || service.execution.runtime !== runtimeId
    || !service.execution.targets?.includes(target)
    || !runtime?.targets?.includes(target)
    || !allowed.includes(name)
    || !(service.execution.capabilities || []).includes(name)) {
    throw createError({ statusCode: 403, message: `Capability ${name || '(empty)'} is not granted to this operation` });
  }

  if (name === 'organization.instances.query') return await graphExecutionsService.queryOrganizationData(input, auth);
  if (name === 'organization.instances.read') {
    const typeId = String(input.typeId || '');
    const instanceId = String(input.instanceId || '');
    if (!typeId || !instanceId) throw createError({ statusCode: 400, message: 'Instance reads require typeId and instanceId' });
    return await graphExecutionsService.queryOrganizationData({ typeId, instanceId, projection: input.projection }, auth);
  }
  if (name === 'organization.instances.create') {
    const typeId = String(input.typeId || '');
    if (!typeId || !input.draft || typeof input.draft !== 'object') throw createError({ statusCode: 400, message: 'Instance creation requires typeId and draft' });
    const instanceService = getAppRegistry().getInstanceService(typeId);
    if (typeof instanceService?.createForHttp !== 'function') throw createError({ statusCode: 404, message: 'Instance create service is unavailable' });
    return await instanceService.createForHttp(input.draft, { auth, organizationId: orgId });
  }
  if (name === 'organization.instances.update') {
    const typeId = String(input.typeId || '');
    const instanceId = String(input.instanceId || '');
    if (!typeId || !instanceId || !input.patch || typeof input.patch !== 'object') throw createError({ statusCode: 400, message: 'Instance update requires typeId, instanceId, and patch' });
    const instanceService = getAppRegistry().getInstanceService(typeId);
    if (typeof instanceService?.patch !== 'function') throw createError({ statusCode: 404, message: 'Instance update service is unavailable' });
    return await instanceService.patch(instanceId, input.patch, {
      auth,
      organizationId: orgId,
      expectedRevision: input.expectedRevision ?? null
    });
  }
  if (name === 'organization.instances.delete') {
    const typeId = String(input.typeId || '');
    const instanceId = String(input.instanceId || '');
    if (!typeId || !instanceId) throw createError({ statusCode: 400, message: 'Instance deletion requires typeId and instanceId' });
    const instanceService = getAppRegistry().getInstanceService(typeId);
    if (typeof instanceService?.removeForHttp !== 'function') throw createError({ statusCode: 404, message: 'Instance delete service is unavailable' });
    return await instanceService.removeForHttp(instanceId, { auth, organizationId: orgId });
  }
  if (name === 'nesting.solve') {
    if (String(pluginId) !== 'nesting' || String(operationId) !== 'nesting-solve') {
      throw createError({ statusCode: 403, message: 'The nesting solver adapter is restricted to nesting.nesting-solve' });
    }
    const endpoint = process.env.NESTING_WORKER_URL || 'http://nesting-worker:8000/nest';
    let destination;
    try {
      destination = new URL(endpoint);
    } catch {
      throw createError({ statusCode: 503, message: 'The platform nesting worker URL is invalid' });
    }
    if (!['http:', 'https:'].includes(destination.protocol) || destination.username || destination.password) {
      throw createError({ statusCode: 503, message: 'The platform nesting worker URL must be an HTTP(S) origin without credentials' });
    }
    let response;
    try {
      response = await fetch(destination, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input)
      });
    } catch (error) {
      throw createError({ statusCode: 502, message: `Nesting worker is unavailable: ${error?.message || String(error)}` });
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw createError({ statusCode: 502, message: `Nesting worker failed: ${detail || response.statusText}` });
    }
    try {
      return await response.json();
    } catch {
      throw createError({ statusCode: 502, message: 'Nesting worker returned invalid JSON' });
    }
  }
  if (name === 'files.read') {
    const fileId = String(input.fileId || '');
    if (!fileId) throw createError({ statusCode: 400, message: 'File reads require fileId' });
    const meta = await filesService.findFileMeta(fileId, 'files');
    if (!meta) throw createError({ statusCode: 404, message: 'File not found' });
    filesService.assertFileReadAccess(meta.metadata, auth);
    const buffer = await filesService.getFileBuffer(fileId, 'files');
    return {
      fileId,
      name: meta.filename,
      mime: meta.contentType,
      size: meta.length,
      organizationId: meta.metadata?.organizationId?.toString?.() || null,
      contentHash: filesService.contentHash(buffer),
      base64: buffer.toString('base64')
    };
  }
  throw createError({ statusCode: 501, message: `Capability ${name} has no host adapter yet` });
}
