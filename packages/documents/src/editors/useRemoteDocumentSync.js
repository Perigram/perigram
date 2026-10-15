import { onBeforeUnmount, ref } from 'vue';
import { onInstanceChanged } from '#utils/instance-events.js';

// The editors' remote-document reconciliation (SPEC UI client sync):
// a save or rename elsewhere publishes the shared instance event — the
// same-tab panes through the browser-local bus, other sessions through
// the realtime bridge. A clean editor reloads its document; a dirty one
// holds its edits and raises the refresh affordance (pre-CRDT conflict
// posture: last writer wins per revisioned save, divergence is never
// silent). The acting editor's own publications are skipped through the
// persistence `origin` token.
export function useRemoteDocumentSync(persistence, { dirty, reload }) {
  const remoteChanged = ref(false);
  let reloading = false;

  function matches(detail = {}) {
    if (!persistence?.instanceId) return false;
    const type = String(detail.type || '').replace(/_/g, '-');
    const own = String(persistence.typeId || '').replace(/_/g, '-');
    return String(detail.id || '') === String(persistence.instanceId) && (!type || !own || type === own);
  }

  const unsubscribe = typeof window !== 'undefined'
    ? onInstanceChanged(async detail => {
      if (!matches(detail) || detail.change === 'deleted') return;
      if (detail.origin && detail.origin === persistence.origin) return;
      if (dirty.value) {
        remoteChanged.value = true;
        return;
      }
      reloading = true;
      try {
        await reload();
      } finally {
        reloading = false;
        remoteChanged.value = false;
      }
    })
    : null;

  onBeforeUnmount(() => unsubscribe?.());

  async function reloadFromRemote() {
    reloading = true;
    try {
      await reload();
      remoteChanged.value = false;
    } finally {
      reloading = false;
    }
  }

  return { remoteChanged, reloadFromRemote, reloading };
}
