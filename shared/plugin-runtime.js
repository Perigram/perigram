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

export function pluginExecutionAbortError(reason = 'Plugin operation was cancelled') {
  const error = new Error(reason instanceof Error ? reason.message : String(reason || 'Plugin operation was cancelled'));
  error.name = 'AbortError';
  error.code = 'PLUGIN_EXECUTION_ABORTED';
  return error;
}

// A capability call belongs to one invocation. The signal owns its lifetime:
// abort rejects pending calls, removes them from the shared map, and makes
// every later call fail immediately instead of waiting for a response that
// can no longer arrive.
export function createAbortableCapabilityCaller({ signal, nextCallId, pending, send }) {
  return (name, input) => {
    if (signal?.aborted) return Promise.reject(pluginExecutionAbortError(signal.reason));
    const callId = nextCallId();
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        signal?.removeEventListener('abort', onAbort);
        pending.delete(callId);
      };
      const settle = (handler, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        handler(value);
      };
      const onAbort = () => settle(reject, pluginExecutionAbortError(signal.reason));
      pending.set(callId, {
        resolve: value => settle(resolve, value),
        reject: error => settle(reject, error)
      });
      signal?.addEventListener('abort', onAbort, { once: true });
      try {
        Promise.resolve(send({ type: 'capability-request', callId, name, input }))
          .catch(error => settle(reject, error));
      } catch (error) {
        settle(reject, error);
      }
    });
  };
}
