import { computed, reactive, ref } from 'vue';
import { useInstanceOverlaysStore } from '~/stores/instance-overlays';
import { editorWriteGranted } from '~/components/generated/file-surfaces.js';
import { setWorkspacePageDirty } from '~/utils/workspace-page-dirty.js';

// The record document's overlay authoring session (SPEC §26): a
// write-grant holder composes custom blocks around the declared content
// and reorders the document's sections; the whole overlay saves as one
// document. The session is the one state home — the section shells, the
// insert picker, the text-block editor, and the header's save
// affordance all bind to it.
export function useRecordOverlaySession({ typeId, instanceId, entity, active, tabKey }) {
  const overlays = useInstanceOverlaysStore();
  const saved = computed(() => overlays.overlayFor(typeId.value, instanceId.value));
  const loaded = computed(() => overlays.loadedFor(typeId.value, instanceId.value));
  const writable = computed(() => Boolean(active?.value !== false && instanceId.value)
    && editorWriteGranted(typeId.value, entity?.value || null));

  const draftBlocks = ref([]);
  const draftOrder = ref([]);
  const dirty = ref(false);
  const saving = ref(false);
  const editingBlockId = ref(null);
  const viewPickerAt = ref(null);
  // The render site reports the composed flow and the natural derivation
  // on every change: the draft seeds from them and the save decision
  // compares against them.
  const flowKeys = ref([]);
  let naturalKeys = [];

  const applied = computed(() => (dirty.value
    ? { blocks: draftBlocks.value, order: draftOrder.value }
    : null));

  function syncFlow(keys, declaredKeys) {
    flowKeys.value = keys;
    naturalKeys = declaredKeys;
  }

  function ensureDraft() {
    if (!loaded.value) return false;
    if (dirty.value) return true;
    draftBlocks.value = (saved.value?.blocks || []).map(block => ({ ...block }));
    draftOrder.value = [...flowKeys.value];
    dirty.value = true;
    setWorkspacePageDirty(tabKey, true);
    return true;
  }

  function move(key, direction) {
    if (!ensureDraft()) return;
    const index = draftOrder.value.indexOf(key);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= draftOrder.value.length) return;
    const next = [...draftOrder.value];
    [next[index], next[target]] = [next[target], next[index]];
    draftOrder.value = next;
  }

  function insertBlock(block, at) {
    if (!ensureDraft()) return null;
    draftBlocks.value = [...draftBlocks.value, block];
    const index = Math.max(0, Math.min(at, draftOrder.value.length));
    draftOrder.value = [...draftOrder.value.slice(0, index), block.id, ...draftOrder.value.slice(index)];
    return block.id;
  }

  function insertText(at) {
    const id = insertBlock({ id: blockId(), kind: 'text', text: '' }, at);
    if (id) editingBlockId.value = id;
  }

  function openViewPicker(at) {
    if (!ensureDraft()) return;
    viewPickerAt.value = at;
  }

  function pickView(view) {
    const at = viewPickerAt.value;
    viewPickerAt.value = null;
    if (view?._id && at !== null) {
      insertBlock({ id: blockId(), kind: 'view', view: { id: String(view._id), name: view.name || '' } }, at);
    }
  }

  function removeBlock(id) {
    if (!ensureDraft()) return;
    draftBlocks.value = draftBlocks.value.filter(block => block.id !== id);
    draftOrder.value = draftOrder.value.filter(key => key !== id);
    if (editingBlockId.value === id) editingBlockId.value = null;
  }

  function updateText(id, text) {
    if (!dirty.value) return;
    draftBlocks.value = draftBlocks.value.map(block => (block.id === id ? { ...block, text } : block));
  }

  async function save() {
    if (!dirty.value || saving.value) return false;
    saving.value = true;
    try {
      const trivial = draftBlocks.value.length === 0 && sameKeys(draftOrder.value, naturalKeys);
      if (trivial) {
        await overlays.remove(typeId.value, instanceId.value);
      } else {
        await overlays.save(typeId.value, instanceId.value, {
          blocks: draftBlocks.value,
          order: draftOrder.value
        });
      }
      dirty.value = false;
      editingBlockId.value = null;
      setWorkspacePageDirty(tabKey, false);
      return true;
    } finally {
      saving.value = false;
    }
  }

  return reactive({
    applied,
    loaded,
    writable,
    dirty,
    saving,
    flowCount: computed(() => flowKeys.value.length),
    editingBlockId: computed(() => editingBlockId.value),
    viewPickerAt: computed(() => viewPickerAt.value),
    syncFlow,
    move,
    insertText,
    openViewPicker,
    pickView,
    closeViewPicker: () => { viewPickerAt.value = null; },
    removeBlock,
    updateText,
    editBlock: id => {
      if (!ensureDraft()) return;
      editingBlockId.value = id;
    },
    closeEditor: () => { editingBlockId.value = null; },
    save
  });
}

function blockId() {
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function sameKeys(a, b) {
  return a.length === b.length && a.every((key, index) => key === b[index]);
}
