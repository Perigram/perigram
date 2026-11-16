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
      self.postMessage({ type: 'ready' });
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

  if (message.type === 'cancel') {
    activeInvocations.get(message.invocationId)?.abort();
    for (const [callId, pending] of capabilityCalls) {
      if (pending.invocationId !== message.invocationId) continue;
      capabilityCalls.delete(callId);
      pending.reject(new Error('Plugin operation was cancelled'));
    }
    return;
  }

  if (message.type !== 'invoke' || !runtime) return;
  const controller = new AbortController();
  activeInvocations.set(message.invocationId, controller);
  const capabilities = {
    call(name, input) {
      const callId = `cap-${++capabilitySequence}`;
      return new Promise((resolve, reject) => {
        capabilityCalls.set(callId, { resolve, reject, invocationId: message.invocationId });
        self.postMessage({
          type: 'capability-request',
          callId,
          invocationId: message.invocationId,
          name,
          input
        });
      });
    }
  };

  try {
    const value = await runtime.execute(message.operationId, message.input, {
      capabilities,
      signal: controller.signal
    });
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
