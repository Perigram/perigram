import { computed } from 'vue';

export function useProcessDesignerPalette({ groups, query, context, searchText, isCompatible }) {
  const filteredGroups = computed(() => filterGroups(query.value, () => true));
  const contextGroups = computed(() => filterGroups(context.value.query, isCompatible));

  function filterGroups(rawQuery, compatibility) {
    const normalized = String(rawQuery || '').trim().toLowerCase();
    return groups
      .map(group => ({
        ...group,
        items: group.items.filter(item => (!normalized || searchText(item).includes(normalized)) && compatibility(item))
      }))
      .filter(group => group.items.length);
  }

  return { contextGroups, filteredGroups };
}
