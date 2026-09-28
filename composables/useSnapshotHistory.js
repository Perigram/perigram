import { computed, ref } from 'vue';

const DEFAULT_LIMIT = 50;

/**
 * Snapshot undo/redo history shared by every editor that owns one. The
 * caller owns the snapshot shape (a JSON string of the edited state) and
 * the apply function that restores state from a snapshot; this composable
 * owns the past/future stacks, their size cap, and the canUndo/canRedo
 * gates. The baseline starts unset, so the first post-mount change (async
 * payload hydration) syncs the baseline instead of creating an undo step;
 * `sync()` re-baselines explicitly (draft recovery), and `commit()` is a
 * no-op when nothing changed.
 */
export function useSnapshotHistory({ snapshot, apply, limit = DEFAULT_LIMIT } = {}) {
  const past = ref([]);
  const future = ref([]);
  let baseline = null;

  const canUndo = computed(() => past.value.length > 0);
  const canRedo = computed(() => future.value.length > 0);

  function reset() {
    past.value = [];
    future.value = [];
    baseline = snapshot();
  }

  function sync() {
    baseline = snapshot();
  }

  function commit() {
    const current = snapshot();
    if (baseline === null || current === baseline) {
      baseline = current;
      return;
    }
    past.value = [...past.value, baseline].slice(-limit);
    future.value = [];
    baseline = current;
  }

  function undo() {
    if (!past.value.length) return;
    const current = snapshot();
    const previous = past.value[past.value.length - 1];
    past.value = past.value.slice(0, -1);
    future.value = [current, ...future.value].slice(0, limit);
    apply(previous);
    baseline = snapshot();
  }

  function redo() {
    if (!future.value.length) return;
    const current = snapshot();
    const next = future.value[0];
    future.value = future.value.slice(1);
    past.value = [...past.value, current].slice(-limit);
    apply(next);
    baseline = snapshot();
  }

  return { canUndo, canRedo, reset, sync, commit, undo, redo };
}
