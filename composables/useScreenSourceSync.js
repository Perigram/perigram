import { onUnmounted } from 'vue';
import { onInstanceChanged } from '~/utils/instance-events.js';
import { normalizeHierarchyType } from '~/utils/instance-hierarchy.js';

// Reconciles a generated surface's sources with the shared instance-event
// contract. A change carrying a complete snapshot already reconciled the
// instances pool reactively (the store's reconciliation listener) — no
// reload. Snapshot-less invalidations (other sessions' published events)
// trigger one debounced source reload; stale list observations then
// refetch through the normal read path.
export function useScreenSourceSync(screenGetter, reload, delay = 80) {
  let timer = null;
  const sourceTypes = () => new Set(((typeof screenGetter === 'function' ? screenGetter() : screenGetter)?.sources || [])
    .map(source => normalizeHierarchyType(source?.typeId))
    .filter(Boolean));
  const stop = onInstanceChanged(change => {
    if (!change.type) return;
    const types = sourceTypes();
    if (!types.size) return;
    if (!types.has(normalizeHierarchyType(change.type))) return;
    if (change.instance) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      reload();
    }, delay);
  });
  onUnmounted(() => {
    if (timer) clearTimeout(timer);
    stop();
  });
}
