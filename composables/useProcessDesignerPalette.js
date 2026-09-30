import { computed } from 'vue';

export function useProcessDesignerPalette({ groups, context, isCompatible }) {
  // Callers may pass a plain array or a ref/computed/getter of one; resolve
  // reactively so async-loaded palette groups appear without remount. Text
  // search is owned by the palette's Listbox filter; this composable only
  // narrows the context palette to socket-compatible operations.
  const resolvedGroups = computed(() => {
    if (typeof groups === 'function') return groups();
    return groups?.value ?? groups;
  });
  const filteredGroups = computed(() => (resolvedGroups.value || []).filter(group => group.items?.length));
  const contextGroups = computed(() => (resolvedGroups.value || [])
    .map(group => ({ ...group, items: group.items.filter(isCompatible) }))
    .filter(group => group.items.length));

  return { contextGroups, filteredGroups };
}
