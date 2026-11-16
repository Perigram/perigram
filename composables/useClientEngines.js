import { ref } from 'vue';

// The client-engine loader (SPEC §20 client-carried): engine modules ship
// as package assets and serve through the module proxy; this composable
// loads each served binding once per version and exposes its dispatch and
// graph-provider contributions. An engine may be service-only, graph-only,
// or both: `createEngine() -> { dispatch?, nodeProviders? }`.
export function engineBindingForService(engines = [], commandId) {
  return (engines || []).find(binding => (binding.services || []).includes(commandId)) || null;
}

export function useClientEngines({ engines = ref([]), loadModule = url => import(/* @vite-ignore */ url) } = {}) {
  const loaded = new Map();
  const errors = ref({});

  function keyOf(binding) {
    return `${binding.pluginId}@${binding.version}`;
  }

  async function engineFor(binding) {
    const key = keyOf(binding);
    const cached = loaded.get(key);
    if (cached) return cached;
    const promise = (async () => {
      const module = await loadModule(binding.url);
      const createEngine = module?.default;
      if (typeof createEngine !== 'function') {
        throw new Error(`Engine ${binding.pluginId} module does not export createEngine`);
      }
      const engine = createEngine();
      if (typeof engine?.dispatch !== 'function' && !Array.isArray(engine?.nodeProviders)) {
        throw new Error(`Engine ${binding.pluginId} must provide dispatch(serviceId, parameters) or nodeProviders`);
      }
      return engine;
    })();
    loaded.set(key, promise);
    try {
      return await promise;
    } catch (cause) {
      loaded.delete(key);
      errors.value = { ...errors.value, [binding.pluginId]: cause.message };
      throw cause;
    }
  }

  function bindingForService(commandId) {
    return engineBindingForService(engines.value, commandId);
  }

  // The preview service channel's local half: a plugin-qualified command
  // id (`plugin.<id>.<service>`) resolves to its engine binding and
  // dispatches there; the caller gates on `bindingForService`.
  async function dispatchService(commandId, parameters) {
    const binding = bindingForService(commandId);
    if (!binding) {
      throw new Error(`Service ${commandId} has no served client engine`);
    }
    const engine = await engineFor(binding);
    if (typeof engine.dispatch !== 'function') {
      throw new Error(`Engine ${binding.pluginId} does not provide service dispatch`);
    }
    return await engine.dispatch(commandId.split('.').pop(), parameters);
  }

  return { engines, errors, engineFor, bindingForService, dispatchService };
}
