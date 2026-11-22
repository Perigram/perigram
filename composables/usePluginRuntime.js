import { ref } from 'vue';
import { normalizeNodeProvider } from '@perigram/plugin-sdk/nodes';
import { collectTransferableBuffers } from '../shared/plugin-runtime.js';

export function usePluginRuntime({
  createWorker = () => new Worker(new URL('./plugin-runtime.worker.js', import.meta.url), { type: 'module' }),
  invokeCapability = async () => { throw new Error('Plugin host capability bridge is unavailable'); }
} = {}) {
  const errors = ref({});
  const runtimes = new Map();
  let invocationSequence = 0;

  function runtimeKey(binding, runtime) {
    return `${binding.organizationId}:${binding.pluginId}@${binding.version}:${runtime.id}@${runtime.version}`;
  }

  function createRuntime(binding, runtime) {
    if (!runtime?.entryUrl) throw new Error(`Runtime ${runtime?.id || ''} has no served entry URL`);
    const worker = createWorker();
    const pending = new Map();
    let readyResolve;
    let readyReject;
    let disposed = false;
    const ready = new Promise((resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
    });

    function rejectPending(error) {
      for (const request of pending.values()) {
        request.signal?.removeEventListener('abort', request.abort);
        request.reject(error);
      }
      pending.clear();
    }

    worker.onmessage = async event => {
      const message = event.data || {};
      if (message.type === 'ready') {
        readyResolve(message.providers || []);
        return;
      }
      if (message.type === 'runtime-error') {
        const error = new Error(message.error?.message || 'Plugin runtime failed to initialize');
        readyReject(error);
        rejectPending(error);
        errors.value = { ...errors.value, [binding.pluginId]: error.message };
        return;
      }
      if (message.type === 'capability-request') {
        const request = pending.get(message.invocationId);
        if (!request) return;
        try {
          if (!request.allowedCapabilities.has(message.name)) {
            throw new Error(`Capability ${message.name} is not declared by this operation`);
          }
          const handler = request.capabilities[message.name];
          if (typeof handler !== 'function') {
            throw new Error(`Capability ${message.name} is unavailable in this host`);
          }
          const value = await handler(message.input, {
            organizationId: binding.organizationId,
            pluginId: binding.pluginId,
            version: binding.version,
            operationId: request.operationId,
            signal: request.signal
          });
          worker.postMessage({ type: 'capability-result', callId: message.callId, value });
        } catch (error) {
          worker.postMessage({
            type: 'capability-result',
            callId: message.callId,
            error: { message: error?.message || String(error) }
          });
        }
        return;
      }
      const request = pending.get(message.invocationId);
      if (!request) return;
      pending.delete(message.invocationId);
      request.signal?.removeEventListener('abort', request.abort);
      if (message.type === 'result-error') {
        request.reject(new Error(message.error?.message || 'Plugin operation failed'));
      } else if (message.type === 'result') {
        request.resolve(message.value);
      }
    };

    worker.onerror = event => {
      const error = new Error(event.message || 'Plugin runtime worker failed');
      readyReject(error);
      rejectPending(error);
      errors.value = { ...errors.value, [binding.pluginId]: error.message };
    };

    worker.postMessage({ type: 'initialize', entryUrl: runtime.entryUrl });

    return {
      async providers() {
        return await ready;
      },
      async invoke(operationId, input, { execution = {}, capabilities = {}, signal, transferInputBuffers = false } = {}) {
        if (disposed) throw new Error('Plugin runtime has been disposed');
        if (!execution.targets?.includes('browser')) {
          throw new Error(`Operation ${operationId} does not support browser execution`);
        }
        if (['commit', 'effect'].includes(execution.kind)) {
          throw new Error(`Operation ${operationId} requires server execution`);
        }
        if (signal?.aborted) throw new Error('Plugin operation was cancelled');
        await ready;
        const invocationId = `invoke-${++invocationSequence}`;
        const allowedCapabilities = new Set(execution.capabilities || []);
        return await new Promise((resolve, reject) => {
          const abort = () => {
            worker.postMessage({ type: 'cancel', invocationId });
            pending.delete(invocationId);
            reject(new Error('Plugin operation was cancelled'));
          };
          pending.set(invocationId, {
            resolve, reject, operationId, capabilities, allowedCapabilities, signal, abort
          });
          signal?.addEventListener('abort', abort, { once: true });
          const invocationInput = transferableInvocation(input);
          // Transfer is opt-in because postMessage detaches sender buffers.
          // Callers may opt in only when the invocation owns these buffers.
          const transfer = transferInputBuffers === true
            ? collectTransferableBuffers(invocationInput)
            : [];
          worker.postMessage({
            type: 'invoke',
            invocationId,
            operationId,
            input: invocationInput
          }, transfer);
        });
      },
      async clearExecution(executionId) {
        if (disposed) throw new Error('Plugin runtime has been disposed');
        await ready;
        const invocationId = `clear-${++invocationSequence}`;
        return await new Promise((resolve, reject) => {
          pending.set(invocationId, {
            resolve, reject, operationId: 'runtime.clearExecution',
            capabilities: {}, allowedCapabilities: new Set(), signal: null, abort: null
          });
          try {
            worker.postMessage({
              type: 'clear-execution',
              invocationId,
              executionId: String(executionId)
            });
          } catch (error) {
            pending.delete(invocationId);
            reject(error);
          }
        });
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        rejectPending(new Error('Plugin runtime has been disposed'));
        worker.terminate();
      }
    };
  }


// Graph evaluation context contains host-owned recorders (notably readSet)
// with functions and Maps. A plugin worker needs only the serializable
// execution metadata; the authoritative recorder remains in the host.
function transferableInvocation(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const result = { ...input };
  if (!input.context || typeof input.context !== 'object') return result;
  const context = {};
  for (const [key, value] of Object.entries(input.context)) {
    if (key === 'readSet' || typeof value === 'function') continue;
    try {
      structuredClone(value);
      context[key] = value;
    } catch {
      // Host-only context values are deliberately not exposed to plugin code.
    }
  }
  result.context = context;
  return result;
}

  function runtimeFor(binding, runtime) {
    const key = runtimeKey(binding, runtime);
    if (!runtimes.has(key)) {
      const instance = createRuntime(binding, runtime);
      runtimes.set(key, instance);
    }
    return runtimes.get(key);
  }

  async function execute(binding, runtime, operationId, input, options = {}) {
    if (!binding?.organizationId || !binding?.pluginId || !binding?.version) throw new Error('Plugin runtime binding requires organizationId, pluginId, and version');
    const instance = runtimeFor(binding, runtime);
    try {
      return await instance.invoke(operationId, input, options);
    } catch (error) {
      errors.value = { ...errors.value, [binding.pluginId]: error.message };
      throw error;
    }
  }

  async function loadProvidersDetailed(binding, runtime) {
    if (!binding?.organizationId || !binding?.pluginId || !binding?.version) {
      throw new Error('Plugin runtime binding requires organizationId, pluginId, and version');
    }
    if (!runtime?.targets?.includes('browser')) return { providers: [], errors: [] };
    const instance = runtimeFor(binding, runtime);
    const contributions = await instance.providers();
    if (!Array.isArray(contributions)) throw new Error(`Runtime ${runtime.id} providers must be an array`);
    const providers = [];
    const errors = [];
    for (const contribution of contributions) {
      const operations = Array.isArray(contribution?.definitions)
        ? contribution.definitions.map(definition => String(definition?.id || '')).filter(Boolean)
        : [];
      try {
        if (!Array.isArray(contribution?.definitions) || !contribution.definitions.length) {
          throw new Error(`Runtime ${runtime.id} provider ${contribution?.provider || '(unknown)'} requires definitions`);
        }
        for (const definition of contribution.definitions) {
          if (definition.execution?.runtime !== runtime.id || !definition.execution?.targets?.includes('browser')) {
            throw new Error(`Node ${definition.id} must declare runtime ${runtime.id} and browser execution support`);
          }
        }
        const previewRenderers = Object.fromEntries(Object.entries(contribution.previewRenderers || {}).map(([rendererId, surfaceId]) => {
          if (typeof surfaceId !== 'string') {
            throw new Error(`Runtime ${runtime.id} preview renderer ${rendererId} must name a declared preview surface`);
          }
          const surface = (binding.previewRenderers || []).find(item => item.id === surfaceId);
          if (!surface) {
            throw new Error(`Runtime ${runtime.id} preview renderer ${rendererId} references unavailable preview surface ${surfaceId}`);
          }
          return [rendererId, surface];
        }));
        const validated = normalizeNodeProvider({
          provider: contribution.provider,
          definitions: contribution.definitions,
          previewRenderers: contribution.previewRenderers || {},
          conversions: contribution.conversions || [],
          execute: () => {}
        });
        providers.push({
          provider: contribution.provider,
          definitions: contribution.definitions,
          conversions: validated.conversions,
          previewRenderers,
          execute: (definition, invocation) => {
            const capabilities = Object.fromEntries((definition.execution.capabilities || []).map(name => [
              name,
              (input, context) => invokeCapability({ binding, runtime, operationId: definition.id, name, input, signal: context.signal })
            ]));
            return execute(binding, runtime, definition.id, invocation, {
              execution: definition.execution,
              capabilities,
              signal: invocation?.context?.signal || invocation?.signal
            });
          }
        });
      } catch (error) {
        errors.push({
          pluginId: String(binding.pluginId),
          runtimeId: String(runtime.id),
          provider: String(contribution?.provider || ''),
          operations,
          message: error?.message || String(error)
        });
      }
    }
    return { providers, errors };
  }

  async function loadProviders(binding, runtime) {
    const result = await loadProvidersDetailed(binding, runtime);
    if (result.errors.length) {
      const error = new AggregateError(
        result.errors.map(item => new Error(item.message)),
        `Runtime ${runtime?.id || ''} contains invalid provider contributions`
      );
      error.providerErrors = result.errors;
      throw error;
    }
    return result.providers;
  }

  async function finalizeExecution(executionId) {
    const results = await Promise.allSettled(
      [...runtimes.values()].map(instance => instance.clearExecution(executionId))
    );
    const failures = results.filter(result => result.status === 'rejected');
    if (failures.length) {
      throw new AggregateError(failures.map(result => result.reason), 'Plugin execution cleanup failed');
    }
    return results.map(result => result.value);
  }

  function dispose() {
    for (const runtime of runtimes.values()) runtime.dispose();
    runtimes.clear();
  }

  return { errors, execute, loadProviders, loadProvidersDetailed, finalizeExecution, dispose };
}
