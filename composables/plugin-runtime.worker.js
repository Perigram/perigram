import { createAbortableCapabilityCaller, pluginExecutionAbortError } from '../shared/plugin-runtime.js';
let runtime = null;
let activeInvocations = new Map();
let capabilitySequence = 0;
const capabilityCalls = new Map();

self.onmessage = async event => {
  const message = event.data || {};
  if (message.type === 'initialize') {
    try {
      const module = await import(message.entryUrl);
      const createRuntime = module.createRuntime || module.default;
      if (typeof createRuntime !== 'function') {
        throw new Error('Runtime module must export createRuntime');
      }
      runtime = await createRuntime();
      if (typeof runtime?.execute !== 'function') {
        throw new Error('Runtime must provide execute(operationId, input, context)');
      }
      const providers = typeof runtime.providers === 'function'
        ? await runtime.providers()
        : (runtime.providers || []);
      if (!Array.isArray(providers)) throw new Error('Runtime providers must be an array of provider metadata');
      for (const provider of providers) {
        for (const [rendererId, surfaceId] of Object.entries(provider.previewRenderers || {})) {
          if (typeof surfaceId !== 'string') {
            throw new Error(`Preview renderer ${rendererId} must reference a declared preview surface id`);
          }
        }
      }
      self.postMessage({ type: 'ready', providers });
    } catch (error) {
      self.postMessage({ type: 'runtime-error', error: serializeError(error) });
    }
    return;
  }

  if (message.type === 'capability-result') {
    const pending = capabilityCalls.get(message.callId);
    if (!pending) return;
    capabilityCalls.delete(message.callId);
    if (message.error) pending.reject(new Error(message.error.message || 'Capability call failed'));
    else pending.resolve(message.value);
    return;
  }

  if (message.type === 'clear-execution' && runtime) {
    try {
      const value = typeof runtime.clearExecution === 'function'
        ? await runtime.clearExecution(String(message.executionId || ''))
        : false;
      self.postMessage({ type: 'result', invocationId: message.invocationId, value });
    } catch (error) {
      self.postMessage({ type: 'result-error', invocationId: message.invocationId, error: serializeError(error) });
    }
    return;
  }

  if (message.type === 'cancel') {
    const controller = activeInvocations.get(message.invocationId);
    if (controller && !controller.signal.aborted) {
      controller.abort(pluginExecutionAbortError());
    }
    return;
  }

  if (message.type !== 'invoke' || !runtime) return;
  const controller = new AbortController();
  activeInvocations.set(message.invocationId, controller);
  const capabilities = {
    call: createAbortableCapabilityCaller({
      signal: controller.signal,
      nextCallId: () => `cap-${++capabilitySequence}`,
      pending: capabilityCalls,
      send: request => self.postMessage({ ...request, invocationId: message.invocationId })
    })
  };

  try {
    const value = await runtime.execute(message.operationId, message.input, {
      capabilities,
      signal: controller.signal
    });
    if (controller.signal.aborted) throw pluginExecutionAbortError(controller.signal.reason);
    self.postMessage({ type: 'result', invocationId: message.invocationId, value });
  } catch (error) {
    self.postMessage({ type: 'result-error', invocationId: message.invocationId, error: serializeError(error) });
  } finally {
    activeInvocations.delete(message.invocationId);
  }
};

function serializeError(error) {
  return {
    name: error?.name || 'Error',
    message: error?.message || String(error),
    stack: error?.stack || ''
  };
}
