import { onUnmounted } from 'vue';
import { onInstanceChanged } from '~/utils/instance-events.js';
import { normalizeHierarchyType } from '~/utils/instance-hierarchy.js';

// Reconciles a generated surface's sources with the shared instance-event
// contract: a change to one of the screen's source types (local optimistic
// mutation, outbox replay, or a server-published event) triggers one
// debounced source reload. The instances store's reconciliation listener
// has already upserted or invalidated the pool record by then, and stale
// list observations refetch through the normal read path.
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
