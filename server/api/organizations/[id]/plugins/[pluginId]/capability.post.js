import { createError, defineEventHandler, readBody } from 'h3';
import { invokePluginCapability } from '~/server/features/plugins/capabilities.js';

export default defineEventHandler(async event => {
  const auth = event.context.auth || {};
  const organizationId = String(event.context.params.id || '');
  const body = await readBody(event) || {};
  if (!auth.userId || String(auth.organizationId || '') !== organizationId) {
    throw createError({ statusCode: 403, message: 'Active organization membership is required' });
  }
  return await invokePluginCapability({
    organizationId,
    pluginId: event.context.params.pluginId,
    version: body.version,
    runtimeId: body.runtimeId,
    operationId: body.operationId,
    name: body.name,
    input: body.input,
    target: 'browser',
    auth
  });
});
