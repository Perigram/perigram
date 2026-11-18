import { getCurrentScope, onScopeDispose, ref } from 'vue';
import { visiblePreviewOutputs } from '~/composables/useProcessDesignerPreview.js';

// Whole-graph preview evaluation for the process channel tabs. The
// process-definition preview endpoint owns execution: CTS reads resolve
// through the authorized data environment and plugin services dispatch
// through their installed managed runtime.
export function useGraphChannelPreview({ persistence, serializeProcess }) {
  const payload = ref(null);
  const running = ref(false);
  const error = ref('');
  let timer = null;
  let runToken = 0;
  let disposed = false;

  async function run() {
    const token = ++runToken;
    if (disposed) return;
    running.value = true;
    error.value = '';
    try {
      const definition = serializeProcess();
      const evaluation = await persistence.previewDraft(definition, undefined);
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
    });
  }

  return { payload, running, error, run, schedule };
}
