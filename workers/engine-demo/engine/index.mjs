// The demo client engine (SPEC §20 client-carried, E3b): the package
// entry module spawns the engine Worker from its own package scope —
// the module proxy serves every asset — and exposes the platform's
// engine contract: dispatch(serviceId, parameters) plus a node-provider
// contribution the graph editor registers under plugin.engine-demo.
export const MAKE_MESH_NODE = {
  provider: 'plugin.engine-demo',
  id: 'make-mesh',
  version: '1',
  label: 'Mesh shape',
  palette: { group: 'engine-demo', label: 'Engine demo', keywords: ['shape', 'mesh', 'wasm'] },
  inputs: [],
  outputs: [{
    id: 'shape',
    shape: 'item',
    semantic: { base: 'json', representation: 'perigram.scene-3d' },
    required: true
  }],
  execution: { kind: 'pure', targets: ['browser'] },
  configuration: {
    type: 'object',
    properties: {
      ring: { type: 'string', default: '2' },
      tube: { type: 'string', default: '0.5 + 0.25 * sin(8)' },
      major: { type: 'integer', default: 24 },
      minor: { type: 'integer', default: 12 }
    }
  }
};

const CONFIGURATION_DEFAULTS = Object.fromEntries(
  Object.entries(MAKE_MESH_NODE.configuration.properties)
    .filter(([, field]) => field.default !== undefined)
    .map(([field, schema]) => [field, schema.default])
);

export default function createEngine() {
  if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') {
    throw new Error('The engine-demo engine requires browser Worker and WebAssembly support');
  }
  const workerUrl = new URL('./worker.mjs', import.meta.url);
  const worker = new Worker(workerUrl, { type: 'module' });
  const baseUrl = workerUrl.href.slice(0, workerUrl.href.lastIndexOf('/') + 1);
  const calls = new Map();
  let callSequence = 0;
  let bootstrapPromise = null;
  let disposed = false;

  worker.onmessage = event => {
    const message = event.data || {};
    if (message.type === 'ready') {
      bootstrapPromise?.resolve(message.provenance || {});
      return;
    }
    if (message.type === 'bootstrap-error') {
      const error = new Error(message.error?.message || 'Engine bootstrap failed');
      bootstrapPromise?.reject(error);
      drain(error);
      return;
    }
    const call = calls.get(message.callId);
    if (!call) return;
    calls.delete(message.callId);
    if (message.type === 'result-error') {
      call.reject(new Error(message.error?.message || 'Engine dispatch failed'));
    } else if (message.type === 'result') {
      call.resolve(message.value);
    }
  };

  worker.onerror = event => {
    const error = new Error(event.message || 'Engine worker failed');
    bootstrapPromise?.reject(error);
    drain(error);
  };

  function drain(error) {
    for (const call of calls.values()) call.reject(error);
    calls.clear();
  }

  function ensureBootstrapped() {
    if (!bootstrapPromise) {
      let settle;
      bootstrapPromise = new Promise((resolve, reject) => {
        settle = { resolve, reject };
      });
      bootstrapPromise.resolve = settle.resolve;
      bootstrapPromise.reject = settle.reject;
      bootstrapPromise.catch(() => {
        bootstrapPromise = null;
      });
      worker.postMessage({ type: 'bootstrap', baseUrl });
    }
    return bootstrapPromise;
  }

  async function dispatch(serviceId, parameters) {
    if (disposed) throw new Error('Engine has been disposed');
    await ensureBootstrapped();
    const callId = `call-${++callSequence}`;
    return await new Promise((resolve, reject) => {
      calls.set(callId, { resolve, reject });
      worker.postMessage({ type: 'dispatch', callId, service: serviceId, parameters });
    });
  }

  async function execute(definition, invocation) {
    const parameters = { ...CONFIGURATION_DEFAULTS, ...(invocation?.config || {}) };
    return { shape: await dispatch(definition.id, parameters) };
  }

  return {
    dispatch,
    nodeProviders: [{
      provider: 'plugin.engine-demo',
      definitions: [MAKE_MESH_NODE],
      execute
    }]
  };
}
