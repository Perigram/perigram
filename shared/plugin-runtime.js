export const PLUGIN_RUNTIME_WORKER_TYPE = 'plugin-runtime';
export const PLUGIN_RUNTIME_MAX_EXECUTION_MS = 60_000;
export const PLUGIN_RUNTIME_MAX_MEMORY_MB = 128;

// Buffers at or above this size move through postMessage transfer lists;
// smaller ones stay on the structured-clone path.
export const PLUGIN_RUNTIME_TRANSFER_MIN_BYTES = 64 * 1024;

export const PLUGIN_RUNTIME_CAPABILITIES = Object.freeze([
  'organization.instances.query',
  'organization.instances.read',
  'organization.instances.create',
  'organization.instances.update',
  'organization.instances.delete',
  'files.read',
  'nesting.solve'
]);

export const PLUGIN_RUNTIME_BROWSER_CAPABILITIES = Object.freeze([
  'organization.instances.query',
  'organization.instances.read',
  'files.read',
  'nesting.solve'
]);

export function pluginExecutionAbortError(reason = 'Plugin operation was cancelled') {
  const error = new Error(reason instanceof Error ? reason.message : String(reason || 'Plugin operation was cancelled'));
  error.name = 'AbortError';
  error.code = 'PLUGIN_EXECUTION_ABORTED';
  return error;
}

// Collects the ArrayBuffers a postMessage sender may hand to its transfer
// list: the backing buffers of typed arrays and raw ArrayBuffers nested in
// plain objects and arrays. Buffers named in `exclude` (views received from
// the peer), shared buffers, detached buffers, and buffers under `minBytes`
// stay on the clone path.
export function collectTransferableBuffers(value, { exclude = new Set(), minBytes = PLUGIN_RUNTIME_TRANSFER_MIN_BYTES } = {}) {
  const buffers = new Set();
  const visited = new Set();
  const offer = buffer => {
    if (!buffer || exclude.has(buffer)) return;
    if (typeof SharedArrayBuffer !== 'undefined' && buffer instanceof SharedArrayBuffer) return;
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength === 0 || buffer.byteLength < minBytes) return;
    buffers.add(buffer);
  };
  const visit = node => {
    if (!node || typeof node !== 'object' || visited.has(node)) return;
    visited.add(node);
    if (ArrayBuffer.isView(node)) {
      offer(node.buffer);
      return;
    }
    if (node instanceof ArrayBuffer || (typeof SharedArrayBuffer !== 'undefined' && node instanceof SharedArrayBuffer)) {
      offer(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const prototype = Object.getPrototypeOf(node);
    if (prototype === Object.prototype || prototype === null) {
      Object.values(node).forEach(visit);
    }
  };
  visit(value);
  return [...buffers];
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
