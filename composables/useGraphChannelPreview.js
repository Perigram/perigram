import { getCurrentScope, onScopeDispose, ref } from 'vue';
import { visiblePreviewOutputs } from '~/composables/useProcessDesignerPreview.js';
import { previewProcessDataflow, serializeProcessResult } from '@perigram/processes';
import { engineBindingForService, useClientEngines } from '~/composables/useClientEngines.js';
import { usePluginRuntime } from '~/composables/usePluginRuntime.js';

// Browser preview is selected only when every service node has a browser
// executor. Legacy client engines and managed JavaScript runtimes both count;
// a graph containing another CTS operation still uses the authoritative
// server evaluator, which enforces each operation's declared server target.
export function useGraphChannelPreview({
  persistence,
  serializeProcess,
  clientEngines = null,
  clientRuntimes = null,
  loadModule = undefined
}) {
  const payload = ref(null);
  const running = ref(false);
  const error = ref('');
  let timer = null;
  let runToken = 0;
  let disposed = false;

  const enginesHolder = ref([]);
  const runtimesHolder = ref([]);
  const loader = useClientEngines(loadModule === undefined ? { engines: enginesHolder } : { engines: enginesHolder, loadModule });
  const pluginRuntime = usePluginRuntime({
    invokeCapability: ({ binding, runtime, operationId, name, input, signal }) => $fetch(
      `/api/organizations/${encodeURIComponent(binding.organizationId)}/plugins/${encodeURIComponent(binding.pluginId)}/capability`,
      {
        method: 'POST',
        signal,
        body: {
          version: binding.version,
          runtimeId: runtime.id,
          operationId,
          name,
          input
        }
      }
    )
  });

  function runtimeServiceBinding(runtimes, serviceId) {
    for (const binding of runtimes || []) {
      const service = (binding.services || []).find(item => `plugin.${binding.pluginId}.${item.id}` === serviceId);
      if (service) return { binding, service };
    }
    return null;
  }

  function canDispatchInBrowser(serviceId, engines, runtimes) {
    return Boolean(engineBindingForService(engines, serviceId) || runtimeServiceBinding(runtimes, serviceId));
  }

  function evaluatesClientSide(definition) {
    const records = Object.values(definition.processNodes || {});
    let carriesLocalService = false;
    for (const record of records) {
      if (!record?.kind || record.kind.startsWith('control.')) continue;
      if (record.kind === 'cts.service') {
        if (!record.operator || !canDispatchInBrowser(record.operator, enginesHolder.value, runtimesHolder.value)) return false;
        carriesLocalService = true;
        continue;
      }
      if (record.kind.startsWith('cts.')) return false;
    }
    return carriesLocalService;
  }

  async function dispatchPreviewService(operatorId, parameters) {
    const engineBinding = engineBindingForService(enginesHolder.value, operatorId);
    if (engineBinding) return loader.dispatchService(operatorId, parameters);

    const match = runtimeServiceBinding(runtimesHolder.value, operatorId);
    if (!match) throw new Error(`Service ${operatorId} has no browser runtime binding`);
    const { binding, service } = match;
    const capabilities = Object.fromEntries((service.execution.capabilities || []).map(name => [
      name,
      (input, context) => $fetch(
        `/api/organizations/${encodeURIComponent(binding.organizationId)}/plugins/${encodeURIComponent(binding.pluginId)}/capability`,
        {
          method: 'POST',
          signal: context.signal,
          body: {
            version: binding.version,
            runtimeId: binding.runtime.id,
            operationId: service.id,
            name,
            input
          }
        }
      )
    ]));
    const result = await pluginRuntime.execute(
      binding,
      binding.runtime,
      service.id,
      { mode: 'preview', inputs: parameters || {} },
      {
        execution: service.execution,
        capabilities
      }
    );
    // Runtime-backed graph providers return the standard { value } envelope;
    // process-service preview consumes the service value itself.
    return result && typeof result === 'object' && Object.hasOwn(result, 'value')
      ? result.value
      : result;
  }

  async function evaluateClientSide(definition, domain) {
    // The same serialization boundary the server preview crosses: the
    // serialized draft carries reactive proxies the browser's structuredClone refuses.
    const plain = JSON.parse(JSON.stringify(definition));
    return serializeProcessResult(await previewProcessDataflow(plain, {}, {
      previewLimit: 100,
      domain,
      previewService: dispatchPreviewService,
      catalogContext: () => ({ domain })
    }));
  }

  async function run() {
    const token = ++runToken;
    if (disposed) return;
    running.value = true;
    error.value = '';
    try {
      const definition = serializeProcess();
      const client = clientEngines ? clientEngines() : null;
      enginesHolder.value = client?.engines || [];
      runtimesHolder.value = clientRuntimes ? (clientRuntimes() || []) : [];
      const evaluation = client && evaluatesClientSide(definition)
        ? await evaluateClientSide(definition, client.domain)
        : await persistence.previewDraft(definition, undefined);
      if (disposed || token !== runToken) return;
      payload.value = visiblePreviewOutputs(evaluation, definition);
    } catch (cause) {
      if (disposed || token !== runToken) return;
      error.value = cause?.data?.message || cause.message;
    } finally {
      if (!disposed && token === runToken) running.value = false;
    }
  }

  function schedule(active, { debounceMs = 300 } = {}) {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    runToken += 1;
    running.value = false;
    if (!active) return;
    timer = setTimeout(() => {
      timer = null;
      run();
    }, debounceMs);
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      disposed = true;
      runToken += 1;
      if (timer) clearTimeout(timer);
      timer = null;
      running.value = false;
      pluginRuntime.dispose();
    });
  }

  return { payload, running, error, run, schedule };
}
