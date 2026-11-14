import { getCurrentScope, onScopeDispose, ref } from 'vue';
import { visiblePreviewOutputs } from '~/composables/useProcessDesignerPreview.js';

// The whole-graph preview evaluation every channel tab rides (SPEC §28):
// no target node, effects suppressed, each node's authored
// `previewVisible` filters its outputs from the payload. The same
// payload feeds the canvas fault states through the session's
// `graphEvaluation` ref.
export function useGraphChannelPreview({ persistence, serializeProcess }) {
  const payload = ref(null);
  const running = ref(false);
  const error = ref('');
  let timer = null;

  async function run() {
    running.value = true;
    error.value = '';
    try {
      const definition = serializeProcess();
      payload.value = visiblePreviewOutputs(await persistence.previewDraft(definition, undefined), definition);
    } catch (cause) {
      error.value = cause?.data?.message || cause.message;
    } finally {
      running.value = false;
    }
  }

  // One debounced seam: the run lands only while the preview tab is the
  // active one; leaving it cancels the pending pass.
  function schedule(active, { debounceMs = 300 } = {}) {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!active) return;
    timer = setTimeout(() => {
      timer = null;
      run();
    }, debounceMs);
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      if (timer) clearTimeout(timer);
    });
  }

  return { payload, running, error, run, schedule };
}
