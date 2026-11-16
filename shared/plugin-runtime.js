export const PLUGIN_RUNTIME_WORKER_TYPE = 'plugin-runtime';
export const PLUGIN_RUNTIME_MAX_EXECUTION_MS = 60_000;
export const PLUGIN_RUNTIME_MAX_MEMORY_MB = 128;

export const PLUGIN_RUNTIME_CAPABILITIES = Object.freeze([
  'organization.instances.query',
  'organization.instances.read',
  'files.read'
]);
