export const PLUGIN_RUNTIME_WORKER_TYPE = 'plugin-runtime';
export const PLUGIN_RUNTIME_MAX_EXECUTION_MS = 60_000;
export const PLUGIN_RUNTIME_MAX_MEMORY_MB = 128;

export const PLUGIN_RUNTIME_CAPABILITIES = Object.freeze([
  'organization.instances.query',
  'organization.instances.read',
  'organization.instances.create',
  'organization.instances.update',
  'organization.instances.delete',
  'files.read',
  'facade.nesting.solve'
]);

export const PLUGIN_RUNTIME_BROWSER_CAPABILITIES = Object.freeze([
  'organization.instances.query',
  'organization.instances.read',
  'files.read'
]);
