import { evaluateExpression } from './interpreter.mjs';

// The demo engine's worker bootstrap: staged runtime assets fetch
// through the plugin module proxy (same-origin, session credentials),
// verify against the manifest's pinned checksums, persist through the
// Cache API keyed by the manifest digest, and only then execute —
// the interpreter and the WASM kernel never run unverified bytes.
const MANIFEST_PATH = '../runtime/manifest.json';
const KERNEL_PATH = '/runtime/kernel.wasm';
const WHEEL_PATH = '/runtime/ops-shapes.mjs';
const CACHE_NAME = 'engine-demo-runtime';

let runtime = null;

self.onmessage = async event => {
  const message = event.data || {};
  if (message.type === 'bootstrap') {
    try {
      const provenance = await bootstrap(message.baseUrl);
      self.postMessage({ type: 'ready', provenance });
    } catch (error) {
      self.postMessage({ type: 'bootstrap-error', error: serializeError(error) });
    }
    return;
  }
  if (message.type === 'dispatch') {
    try {
      if (!runtime) throw new Error('Engine runtime is not bootstrapped');
      const value = dispatch(message.service, message.parameters || {});
      self.postMessage({ type: 'result', callId: message.callId, value });
    } catch (error) {
      self.postMessage({ type: 'result-error', callId: message.callId, error: serializeError(error) });
    }
  }
};

async function bootstrap(baseUrl) {
  const manifestUrl = new URL(MANIFEST_PATH, baseUrl);
  const manifestResponse = await fetch(manifestUrl);
  if (!manifestResponse.ok) {
    throw new Error(`Runtime manifest answered ${manifestResponse.status}`);
  }
  const manifestBytes = await manifestResponse.arrayBuffer();
  const pin = await sha256Hex(manifestBytes);
  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
  const cache = await openCache();
  const provenance = { pin, fetched: [], cached: [] };
  const staged = new Map();
  for (const asset of manifest.assets || []) {
    staged.set(
      asset.path,
      await stagedFetch(new URL(`..${asset.path}`, baseUrl), asset.sha256, `${pin}${asset.path}`, cache, provenance)
    );
  }
  const kernelBytes = staged.get(KERNEL_PATH);
  const wheelBytes = staged.get(WHEEL_PATH);
  if (!kernelBytes || !wheelBytes) {
    throw new Error(`Runtime manifest does not stage ${KERNEL_PATH} and ${WHEEL_PATH}`);
  }
  const { instance } = await WebAssembly.instantiate(kernelBytes, {});
  const wheel = await importModuleFromBytes(wheelBytes);
  runtime = {
    memory: instance.exports.memory,
    tessellate: instance.exports.tessellate,
    buildSceneValue: wheel.buildSceneValue
  };
  return provenance;
}

async function openCache() {
  if (typeof self.caches === 'undefined') return null;
  try {
    return await self.caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

async function stagedFetch(url, sha256, cacheKey, cache, provenance) {
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) {
      provenance.cached.push(cacheKey);
      return await hit.arrayBuffer();
    }
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Runtime asset ${url.pathname} answered ${response.status}`);
  }
  const bytes = await response.arrayBuffer();
  const digest = await sha256Hex(bytes);
  if (digest !== String(sha256).replace(/^sha256:/, '')) {
    throw new Error(`Runtime asset ${url.pathname} failed its pinned checksum`);
  }
  if (cache) await cache.put(cacheKey, new Response(bytes, { status: 200 }));
  provenance.fetched.push(cacheKey);
  return bytes;
}

async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function importModuleFromBytes(bytes) {
  let binary = '';
  const source = new Uint8Array(bytes);
  for (let index = 0; index < source.length; index += 1) {
    binary += String.fromCharCode(source[index]);
  }
  return import(`data:text/javascript;base64,${btoa(binary)}`);
}

function dispatch(service, parameters) {
  if (service !== 'make-mesh') {
    throw new Error(`Unknown engine service ${service}`);
  }
  const ring = evaluateExpression(parameters.ring);
  const tube = evaluateExpression(parameters.tube);
  const major = clampInteger(parameters.major, 3, 256);
  const minor = clampInteger(parameters.minor, 3, 256);
  const count = major * minor;
  const bytesNeeded = count * 3 * 2 * 8;
  const memory = runtime.memory;
  if (memory.buffer.byteLength < bytesNeeded) {
    memory.grow(Math.ceil((bytesNeeded - memory.buffer.byteLength) / 65536));
  }
  runtime.tessellate(0, major, minor, ring, tube);
  return runtime.buildSceneValue(memory.buffer, 0, count, major, minor);
}

function clampInteger(value, minimum, maximum) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) throw new Error(`Expected a number, got ${JSON.stringify(value)}`);
  return Math.min(maximum, Math.max(minimum, number));
}

function serializeError(error) {
  return { name: error?.name || 'Error', message: error?.message || String(error) };
}
