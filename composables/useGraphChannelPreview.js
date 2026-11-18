import { getCurrentScope, onScopeDispose, ref } from 'vue';
import { visiblePreviewOutputs } from '~/composables/useProcessDesignerPreview.js';
import { previewProcessDataflow, serializeProcessResult } from '@perigram/processes';
import { engineBindingForService, useClientEngines } from '~/composables/useClientEngines.js';

// The whole-graph preview evaluation every channel tab rides (SPEC §28):
// no target node, effects suppressed, each node's authored
// `previewVisible` filters its outputs from the payload. A graph whose
// service nodes all bind served client engines evaluates in the browser
// (SPEC §20): the one evaluator hosts client-side with the engine
// loader as its preview service channel. The same
// payload feeds the canvas fault states through the session's
// `graphEvaluation` ref. `clientEngines` is a lazy resolver —
// `() => ({ engines, domain })` — because hosts wire it beside the
// session that feeds it.
export function useGraphChannelPreview({ persistence, serializeProcess, clientEngines = null, loadModule = undefined }) {
  const payload = ref(null);
  const running = ref(false);
  const error = ref('');
  let timer = null;
  let runToken = 0;
  let disposed = false;

  const enginesHolder = ref([]);
  const loader = useClientEngines(loadModule === undefined ? { engines: enginesHolder } : { engines: enginesHolder, loadModule });

  function evaluatesClientSide(definition) {
    const records = Object.values(definition.processNodes || {});
    let carriesLocalService = false;
    for (const record of records) {
      if (!record?.kind || record.kind.startsWith('control.')) continue;
      if (record.kind === 'cts.service') {
        if (!record.operator || !engineBindingForService(enginesHolder.value, record.operator)) return false;
        carriesLocalService = true;
        continue;
      }
      if (record.kind.startsWith('cts.')) return false;
    }
    return carriesLocalService;
  }

  async function evaluateClientSide(definition, domain) {
    // The same serialization boundary the server preview crosses: the
    // serialized draft carries reactive proxies the browser's
    // structuredClone refuses.
    const plain = JSON.parse(JSON.stringify(definition));
    return serializeProcessResult(await previewProcessDataflow(plain, {}, {
      previewLimit: 100,
      domain,
      previewService: (operatorId, parameters) => loader.dispatchService(operatorId, parameters),
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

  // One debounced seam: the run lands only while the preview tab is the
  // active one; leaving it invalidates both pending and in-flight work.
  function schedule(active, { debounceMs = 300 } = {}) {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!active) {
      runToken += 1;
      running.value = false;
      return;
    }
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
    });
  }

  return { payload, running, error, run, schedule };
}
