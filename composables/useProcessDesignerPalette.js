import { computed } from 'vue';

export function useProcessDesignerPalette({ groups, query, context, searchText, isCompatible }) {
  // Callers may pass a plain array or a ref/computed/getter of one; resolve
  // reactively so async-loaded palette groups appear without remount.
  const resolvedGroups = computed(() => {
    if (typeof groups === 'function') return groups();
    return groups?.value ?? groups;
  });
  const filteredGroups = computed(() => filterGroups(resolvedGroups.value, query.value, () => true));
  const contextGroups = computed(() => filterGroups(resolvedGroups.value, context.value.query, isCompatible));

  function filterGroups(sourceGroups, rawQuery, compatibility) {
    const normalized = String(rawQuery || '').trim().toLowerCase();
    return (sourceGroups || [])
      .map(group => ({
        ...group,
        items: group.items.filter(item => (!normalized || searchText(item).includes(normalized)) && compatibility(item))
      }))
      .filter(group => group.items.length);
  }

  return { contextGroups, filteredGroups };
}
