import { createError } from 'h3';
import { findInstallByConnectorToken } from '../../features/plugins/repository.js';

// Worker endpoints accept two credentials: the deployment-wide
// WORKER_TOKEN (global scope, the operator's own workers) and per-install
// connector tokens minted by plugin installs (marketplace SPEC: a
// connector may claim only its own organization's runs for its plugin).
export async function requireWorkerAccess(event) {
  const token = event.node.req.headers['x-worker-token'];
  if (token) {
    const install = await findInstallByConnectorToken(String(token));
    if (install) {
      return {
        scope: 'connector',
        organizationId: String(install.organizationId),
        pluginId: String(install.pluginId)
      };
    }
  }
  const expected = process.env.WORKER_TOKEN || process.env.NUXT_WORKER_TOKEN;
  if (!expected) throw createError({ statusCode: 500, message: 'WORKER_TOKEN is required' });
  if (token !== expected) throw createError({ statusCode: 401, message: 'Invalid worker token' });
  return { scope: 'global' };
}

// A connector's claims are pinned to its install's queue: the plugin's
// task runs for that organization only.
export function connectorWorkerType(scope) {
  return `plugin.${scope.pluginId}@${scope.organizationId}`;
}
