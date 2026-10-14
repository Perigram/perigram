import { computed, ref, watch } from 'vue';

// The document-name toolbar state shared by the pack's editors: the
// draft commits through the persistence `rename` seam on enter, the
// apply control, or blur. Hosts render their own toolbar row around it.
export function useDocumentName(persistence, onRenamed = () => {}) {
  const localTitle = ref('');
  const displayName = computed(() => localTitle.value || persistence.title || '');
  const nameDraft = ref('');
  const editingName = ref(false);
  const nameDirty = computed(() => Boolean(nameDraft.value.trim()) && nameDraft.value.trim() !== displayName.value);

  watch(displayName, value => {
    if (!editingName.value) nameDraft.value = value;
  }, { immediate: true });

  async function commitName() {
    editingName.value = false;
    const name = nameDraft.value.trim();
    if (!name || name === displayName.value) {
      nameDraft.value = displayName.value;
      return;
    }
    localTitle.value = name;
    try {
      if (typeof persistence.rename === 'function') {
        await persistence.rename(name);
        onRenamed();
      }
    } catch (error) {
      localTitle.value = persistence.title || '';
      nameDraft.value = displayName.value;
      console.error('Failed to rename document:', error);
    }
  }

  return { displayName, nameDraft, editingName, nameDirty, commitName };
}
