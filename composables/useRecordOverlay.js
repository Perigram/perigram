import { computed, nextTick, onScopeDispose, reactive, ref, watch } from 'vue';
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
  const editingCaret = ref('start');
  const editingInitialBlock = ref('');
  const activeBlockId = ref(null);
  const dragKey = ref(null);
  const viewPickerAt = ref(null);
  // The render site reports the composed flow and the natural derivation
  // on every change: the draft seeds from them and the save decision
  // compares against them.
  const flowKeys = ref([]);
  const textEditors = new Map();
  let naturalKeys = [];

  const applied = computed(() => (dirty.value
    ? { blocks: draftBlocks.value, order: draftOrder.value }
    : null));
  const blockById = computed(() => new Map(draftBlocks.value.map(block => [block.id, block])));

  function syncFlow(keys, declaredKeys) {
    flowKeys.value = keys;
    naturalKeys = declaredKeys;
  }

  // User space autosaves (owner ruling 2026-11-08): a settled draft
  // writes itself; the header's save slot stays as the flush-now
  // control.
  let autosaveTimer = null;
  watch(dirty, value => {
    if (!value) return;
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      autosaveTimer = null;
      save().catch(() => {});
    }, 1500);
  });
  onScopeDispose(() => {
    if (autosaveTimer) clearTimeout(autosaveTimer);
  });

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

  // Drag reordering: the pointer picks a target index between two
  // sections; the order array alone decides the document.
  function moveToIndex(key, targetIndex) {
    if (!ensureDraft()) return;
    const index = draftOrder.value.indexOf(key);
    if (index < 0) return;
    const clamped = Math.max(0, Math.min(targetIndex, draftOrder.value.length));
    const next = [...draftOrder.value];
    next.splice(index, 1);
    const destination = index < clamped ? clamped - 1 : clamped;
    next.splice(destination, 0, key);
    draftOrder.value = next;
  }

  function insertBlock(block, at) {
    if (!ensureDraft()) return null;
    draftBlocks.value = [...draftBlocks.value, block];
    const index = Math.max(0, Math.min(at, draftOrder.value.length));
    draftOrder.value = [...draftOrder.value.slice(0, index), block.id, ...draftOrder.value.slice(index)];
    return block.id;
  }

  function insertText(at, initialBlock = '', text = '') {
    const id = insertBlock({ id: blockId(), kind: 'text', text: String(text || '') }, at);
    if (id) {
      editingInitialBlock.value = initialBlock;
      editingCaret.value = 'start';
      editingBlockId.value = id;
    }
    return id;
  }

  function insertTextAfter(blockId, initialBlock = 'paragraph', text = '') {
    if (!ensureDraft()) return null;
    const index = draftOrder.value.indexOf(blockId);
    if (index < 0) return null;
    return insertText(index + 1, initialBlock, text);
  }

  function appendTextBlock(text) {
    const value = String(text || '');
    if (!value.trim() || !ensureDraft()) return null;
    return insertBlock({ id: blockId(), kind: 'text', text: value }, draftOrder.value.length);
  }

  function openViewPicker(at) {
    if (!ensureDraft()) return;
    viewPickerAt.value = at;
  }

  function openViewPickerAfter(blockId) {
    const index = draftOrder.value.indexOf(blockId);
    openViewPicker(index < 0 ? draftOrder.value.length : index + 1);
  }

  function openViewPickerAtEnd() {
    openViewPicker(draftOrder.value.length);
  }

  function pickView(view) {
    const at = viewPickerAt.value;
    viewPickerAt.value = null;
    if (at === null || !view) return;
    if (view.id) {
      insertBlock({ id: blockId(), kind: 'view', view: { id: String(view.id), typeId: String(view.typeId || ''), name: view.name || '' } }, at);
    } else if (view.typeId) {
      insertBlock({ id: blockId(), kind: 'view', view: { typeId: String(view.typeId), name: view.name || '' } }, at);
    }
  }

  function removeBlock(id) {
    if (!ensureDraft()) return;
    draftBlocks.value = draftBlocks.value.filter(block => block.id !== id);
    draftOrder.value = draftOrder.value.filter(key => key !== id);
    if (editingBlockId.value === id) {
      editingBlockId.value = null;
      editingInitialBlock.value = '';
    }
    if (activeBlockId.value === id) activeBlockId.value = null;
  }

  function previousTextBlock(id) {
    const index = draftOrder.value.indexOf(id);
    if (index < 0) return null;
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const key = draftOrder.value[cursor];
      if (blockById.value.get(key)?.kind === 'text') return key;
    }
    return null;
  }

  function nextTextBlock(id) {
    const index = draftOrder.value.indexOf(id);
    if (index < 0) return null;
    for (let cursor = index + 1; cursor < draftOrder.value.length; cursor += 1) {
      const key = draftOrder.value[cursor];
      if (blockById.value.get(key)?.kind === 'text') return key;
    }
    return null;
  }

  function removeEmptyBlock(id) {
    if (!ensureDraft()) return;
    const previous = previousTextBlock(id);
    removeBlock(id);
    if (previous) {
      editingInitialBlock.value = '';
      editingCaret.value = 'end';
      editingBlockId.value = previous;
    }
  }

  function splitBlock(id, after = '') {
    if (!ensureDraft()) return null;
    const index = draftOrder.value.indexOf(id);
    if (index < 0) return null;
    return insertText(index + 1, '', after);
  }

  function mergeWithPrevious(id) {
    if (!ensureDraft()) return false;
    const previous = previousTextBlock(id);
    if (!previous) return false;
    const markdown = textEditors.get(id)?.getMarkdown?.() ?? blockById.value.get(id)?.text ?? '';
    const target = textEditors.get(previous);
    if (target?.appendMarkdown) target.appendMarkdown(markdown);
    else updateText(previous, `${blockById.value.get(previous)?.text || ''}${markdown}`);
    removeBlock(id);
    return true;
  }

  function mergeNext(id) {
    if (!ensureDraft()) return false;
    const next = nextTextBlock(id);
    if (!next) return false;
    const markdown = textEditors.get(next)?.getMarkdown?.() ?? blockById.value.get(next)?.text ?? '';
    const target = textEditors.get(id);
    if (target?.appendMarkdown) target.appendMarkdown(markdown);
    else updateText(id, `${blockById.value.get(id)?.text || ''}${markdown}`);
    removeBlock(next);
    return true;
  }

  function registerTextEditor(id, api) {
    if (id && api) textEditors.set(id, api);
  }

  function unregisterTextEditor(id) {
    textEditors.delete(id);
  }

  function pruneEmptyTextBlocks() {
    if (!dirty.value) return;
    const emptyIds = draftOrder.value.filter(key => {
      const block = blockById.value.get(key);
      return block?.kind === 'text' && !String(block.text || '').trim();
    });
    if (!emptyIds.length) return;
    const empty = new Set(emptyIds);
    draftBlocks.value = draftBlocks.value.filter(block => !empty.has(block.id));
    draftOrder.value = draftOrder.value.filter(key => !empty.has(key));
    if (empty.has(editingBlockId.value)) {
      editingBlockId.value = null;
      editingInitialBlock.value = '';
    }
    if (empty.has(activeBlockId.value)) activeBlockId.value = null;
  }

  function releaseFocus(id) {
    if (activeBlockId.value === id) activeBlockId.value = null;
    if (editingBlockId.value === id) {
      editingBlockId.value = null;
      editingInitialBlock.value = '';
    }
    nextTick(() => {
      if (activeBlockId.value || editingBlockId.value) return;
      pruneEmptyTextBlocks();
    });
  }

  // Arrow keys at a text block's visual edge continue in the adjacent
  // text block; non-editing sections between them are skipped.
  function moveCaret(id, direction = 'down') {
    if (!ensureDraft()) return false;
    const forward = direction === 'down' || direction === 'right';
    const start = draftOrder.value.indexOf(id);
    if (start < 0) return false;
    for (let index = start + (forward ? 1 : -1); index >= 0 && index < draftOrder.value.length; index += forward ? 1 : -1) {
      const key = draftOrder.value[index];
      if (!draftBlocks.value.some(block => block.id === key && block.kind === 'text')) continue;
      editingInitialBlock.value = '';
      editingCaret.value = forward ? 'start' : 'end';
      editingBlockId.value = key;
      return true;
    }
    return false;
  }

  // The trailing line's Backspace resumes the document's last text block,
  // the same continuation the empty-block Backspace gives.
  function resumeLastTextBlock() {
    if (!ensureDraft()) return false;
    const id = [...draftOrder.value].reverse()
      .find(key => draftBlocks.value.some(block => block.id === key && block.kind === 'text'));
    if (!id) return false;
    editingInitialBlock.value = '';
    editingCaret.value = 'end';
    editingBlockId.value = id;
    return true;
  }

  function updateText(id, text) {
    if (!ensureDraft()) return;
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
    caretFor: id => (editingBlockId.value === id ? editingCaret.value : 'start'),
    activeBlockId: computed(() => activeBlockId.value),
    activateBlock: id => { activeBlockId.value = id; },
    deactivateBlock: id => { if (activeBlockId.value === id) activeBlockId.value = null; },
    initialBlockFor: id => (editingBlockId.value === id ? editingInitialBlock.value : ''),
    dragKey: computed(() => dragKey.value),
    beginDrag: key => { dragKey.value = key; },
    endDrag: () => { dragKey.value = null; },
    viewPickerAt: computed(() => viewPickerAt.value),
    syncFlow,
    move,
    moveToIndex,
    insertText,
    insertTextAfter,
    appendTextBlock,
    openViewPicker,
    openViewPickerAfter,
    openViewPickerAtEnd,
    pickView,
    closeViewPicker: () => { viewPickerAt.value = null; },
    moveCaret,
    removeBlock,
    removeEmptyBlock,
    splitBlock,
    mergeWithPrevious,
    mergeNext,
    registerTextEditor,
    unregisterTextEditor,
    releaseFocus,
    resumeLastTextBlock,
    updateText,
    editBlock: id => {
      if (!ensureDraft()) return;
      editingInitialBlock.value = '';
      editingCaret.value = 'start';
      editingBlockId.value = id;
    },
    closeEditor: () => {
      const id = editingBlockId.value;
      editingBlockId.value = null;
      editingInitialBlock.value = '';
      const block = draftBlocks.value.find(candidate => candidate.id === id);
      if (block?.kind === 'text' && !String(block.text || '').trim()) removeBlock(id);
      nextTick(pruneEmptyTextBlocks);
    },
    save
  });
}

function blockId() {
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function sameKeys(a, b) {
  return a.length === b.length && a.every((key, index) => key === b[index]);
}
