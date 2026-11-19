// The synchronous managed-runtime boundary for service-resolved
// projections (the plugins README "Service-resolved projections"): loads
// the pinned organization package's runtime entry in-process and
// executes one declared pure operation over hydrated values. Projections
// are synchronous reads inside caller requests and cannot park on the
// claim queue, so the isolated plugin-runtime worker does not serve
// them; this boundary keeps the same gates — installed pin, package
// manifest digest verification over the executed entry, declared
// operation, and a bounded deadline.
//
// The executed entry must be a self-contained JavaScript module (the
// documents-shared runtime bundle is built that way): a data:-URL import
// gives it a fresh module registry with no host modules reachable. The
// deadline bounds the caller's wait; the computation itself is pure
// compute over values the platform hydrated, and the async worker
// remains the containment boundary for anything heavier.
import { createError } from 'h3';
import { PLUGIN_RUNTIME_MAX_EXECUTION_MS } from '#shared/plugin-runtime.js';
import * as repository from './repository.js';
import * as filesService from '../files/service.js';

// Imported runtime modules keyed by plugin pin + entry content digest —
// immutable per digest, so one import serves every later call. Bounded
// so a chain of upgrades cannot grow the registry without end.
const MODULE_CACHE_LIMIT = 16;
const runtimeModules = new Map();

async function importRuntimeModule(cacheKey, loader) {
  const cached = runtimeModules.get(cacheKey);
  if (cached) return cached;
  const loaded = loader();
  runtimeModules.set(cacheKey, loaded);
  if (runtimeModules.size > MODULE_CACHE_LIMIT) {
    runtimeModules.delete(runtimeModules.keys().next().value);
  }
  return loaded;
}

// Refuses every capability call: a projection operation is pure compute
// over hydrated values and declares no capabilities.
function refusingCapabilities() {
  const refuse = () => Promise.reject(createError({
    statusCode: 403,
    message: 'Synchronous projection execution mediates no host capabilities'
  }));
  return { call: refuse };
}

export async function executeSyncManagedOperation({
  organizationId = '',
  install = null,
  runtime = null,
  operationId = '',
  input = null,
  timeoutMs = PLUGIN_RUNTIME_MAX_EXECUTION_MS
} = {}) {
  const pluginId = String(install?.pluginId || '');
  const version = String(install?.version || '');
  const entry = String(runtime?.entry || '').replace(/^\//, '');
  if (!organizationId || !pluginId || !version || !entry || !operationId) {
    throw createError({ statusCode: 400, message: 'Synchronous managed projection identity is incomplete' });
  }
  const manifestEntry = (install.packageAssets?.assets || []).find(item => String(item.path) === entry);
  if (!manifestEntry) {
    throw createError({ statusCode: 409, message: `Runtime entry ${runtime.entry} is missing from the installed package manifest` });
  }
  const meta = await repository.findOrganizationPluginAssetMeta(organizationId, pluginId, version, entry);
  if (!meta) {
    throw createError({ statusCode: 409, message: `Installed package asset ${entry} is missing` });
  }
  const buffer = await repository.readOrganizationPluginAsset(meta);
  const digest = filesService.contentHash(buffer);
  if (manifestEntry.contentHash && digest !== manifestEntry.contentHash) {
    throw createError({ statusCode: 409, message: `Installed package asset ${entry} failed its content digest check` });
  }
  const cacheKey = `${pluginId}@${version}@${entry}@${digest}`;
  const module = await importRuntimeModule(cacheKey, async () => {
    try {
      return await import(`data:text/javascript;base64,${buffer.toString('base64')}`);
    } catch (error) {
      throw createError({
        statusCode: 502,
        message: `Runtime entry ${runtime.entry} failed to load in the synchronous managed boundary: ${error?.message || error}`
      });
    }
  });
  const createRuntime = module.createRuntime || module.default;
  if (typeof createRuntime !== 'function') {
    throw createError({ statusCode: 502, message: `Runtime entry ${runtime.entry} does not export createRuntime` });
  }
  const runtimeInstance = await createRuntime();
  if (typeof runtimeInstance?.execute !== 'function') {
    throw createError({ statusCode: 502, message: `Runtime ${runtime.id} must provide execute(operationId, input, context)` });
  }
  const deadline = Math.max(1, Number(timeoutMs) || PLUGIN_RUNTIME_MAX_EXECUTION_MS);
  let timedOut = false;
  const execution = Promise.resolve(runtimeInstance.execute(operationId, input ?? null, { capabilities: refusingCapabilities() }));
  execution.catch(() => {});
  const timeout = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      timedOut = true;
      reject(createError({ statusCode: 504, message: `Synchronous managed projection ${operationId} exceeded its execution deadline` }));
    }, deadline);
    timer.unref?.();
  });
  timeout.catch(() => {});
  try {
    return await Promise.race([execution, timeout]);
  } finally {
    if (timedOut) {
      // A timed-out module may be stuck mid-computation: drop it so the
      // next call imports a fresh instance.
      runtimeModules.delete(cacheKey);
    }
  }
}
