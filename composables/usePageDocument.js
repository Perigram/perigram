import { computed, onScopeDispose, reactive, ref, unref, watch } from 'vue';
import { usePagesStore } from '~/stores/pages';
import { createBlockId } from '#shared/page-document.js';
import { setWorkspacePageDirty } from '~/utils/workspace-page-dirty.js';

// The Page document authoring session (SPEC §26): ordered text and
// collection blocks, autosaved through the pages API. The block list, the
// text-block editors, the insert controls, and the collection picker bind
// to this one state home.
export function usePageDocumentSession({ docId, tabKey }) {
  const pagesStore = usePagesStore();
  const id = computed(() => String(unref(docId) || ''));
  const document = computed(() => pagesStore.documents[id.value] || { blocks: [], order: [] });
  const loaded = computed(() => Boolean(id.value) && id.value in pagesStore.documents);

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
  let seededDocument = null;

  const blockById = computed(() => new Map(draftBlocks.value.map(block => [block.id, block])));

  function markDirty() {
    dirty.value = true;
    setWorkspacePageDirty(tabKey, true);
  }

  function isEmptyText(block) {
    return block?.kind === 'text' && !String(block.text || '').trim();
  }

  // The page document always ends with one empty text block: the author's
  // next line is a real block, not a separate composer outside the list.
  function ensureTrailingTextBlock() {
    const lastKey = draftOrder.value[draftOrder.value.length - 1];
    if (isEmptyText(blockById.value.get(lastKey))) return false;
    const existing = draftBlocks.value.find(isEmptyText);
    if (existing) {
      draftOrder.value = [...draftOrder.value.filter(key => key !== existing.id), existing.id];
      return true;
    }
    const block = { id: createBlockId('t'), kind: 'text', text: '' };
    draftBlocks.value = [...draftBlocks.value, block];
    draftOrder.value = [...draftOrder.value, block.id];
    return true;
  }

  watch(document, value => {
    if (dirty.value) return;
    const key = JSON.stringify(value);
    if (key === seededDocument) return;
    seededDocument = key;
    draftBlocks.value = (value.blocks || []).map(block => ({ ...block }));
    draftOrder.value = [...(value.order || [])];
    ensureTrailingTextBlock();
  }, { immediate: true, deep: true });

  function move(key, direction) {
    const index = draftOrder.value.indexOf(key);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= draftOrder.value.length) return;
    const next = [...draftOrder.value];
    [next[index], next[target]] = [next[target], next[index]];
    draftOrder.value = next;
    ensureTrailingTextBlock();
    markDirty();
  }

  function moveToIndex(key, targetIndex) {
    const index = draftOrder.value.indexOf(key);
    if (index < 0) return;
    const clamped = Math.max(0, Math.min(targetIndex, draftOrder.value.length));
    const next = [...draftOrder.value];
    next.splice(index, 1);
    const destination = index < clamped ? clamped - 1 : clamped;
    next.splice(destination, 0, key);
    draftOrder.value = next;
    ensureTrailingTextBlock();
    markDirty();
  }

  function insertBlock(block, at) {
    draftBlocks.value = [...draftBlocks.value, block];
    const index = Math.max(0, Math.min(at, draftOrder.value.length));
    draftOrder.value = [...draftOrder.value.slice(0, index), block.id, ...draftOrder.value.slice(index)];
    ensureTrailingTextBlock();
    markDirty();
    return block.id;
  }

  function insertText(at, initialBlock = '') {
    const id = insertBlock({ id: createBlockId('t'), kind: 'text', text: '' }, at);
    editingInitialBlock.value = initialBlock;
    editingCaret.value = 'start';
    editingBlockId.value = id;
  }

  function insertTextAfter(blockId, initialBlock = 'paragraph') {
    const index = draftOrder.value.indexOf(blockId);
    if (index < 0) return;
    insertText(index + 1, initialBlock);
  }

  function appendTextBlock(text) {
    const value = String(text || '');
    if (!value.trim()) return null;
    return insertBlock({ id: createBlockId('t'), kind: 'text', text: value }, draftOrder.value.length);
  }

  function openViewPicker(at) {
    viewPickerAt.value = at;
  }

  function openViewPickerAfter(blockId) {
    const index = draftOrder.value.indexOf(blockId);
    openViewPicker(index < 0 ? draftOrder.value.length : index + 1);
  }

  function openViewPickerAtEnd() {
    openViewPicker(draftOrder.value.length);
  }

  function pickView(pick) {
    const at = viewPickerAt.value;
    viewPickerAt.value = null;
    if (at === null || !pick) return;
    const view = {
      ...(pick.id ? { id: String(pick.id) } : {}),
      typeId: String(pick.typeId || ''),
      name: String(pick.name || ''),
      parameters: pick.parameters && typeof pick.parameters === 'object' ? pick.parameters : {},
      resultPolicy: pick.resultPolicy === 'pinned' ? 'pinned' : 'live',
      ...(pick.parentTypeId ? { parentTypeId: String(pick.parentTypeId) } : {}),
      ...(pick.parentId ? { parentId: String(pick.parentId) } : {}),
      ...(pick.sourceId ? { sourceId: String(pick.sourceId) } : {}),
      ...(pick.definitionRevision ? { definitionRevision: String(pick.definitionRevision) } : {}),
      ...(pick.definitionSnapshot ? { definitionSnapshot: { viewState: pick.definitionSnapshot.viewState || {} } } : {})
    };
    if (!view.id && !view.typeId) return;
    insertBlock({ id: createBlockId('v'), kind: 'view', view }, at);
  }

  const referencePickerAt = ref(null);
  const graphOutputPickerAt = ref(null);

  function openReferencePicker(at) {
    referencePickerAt.value = at;
  }

  function openReferencePickerAfter(blockId) {
    const index = draftOrder.value.indexOf(blockId);
    openReferencePicker(index < 0 ? draftOrder.value.length : index + 1);
  }

  function openReferencePickerAtEnd() {
    openReferencePicker(draftOrder.value.length);
  }

  function closeReferencePicker() {
    referencePickerAt.value = null;
  }

  function pickReference(ref = {}) {
    const at = referencePickerAt.value;
    referencePickerAt.value = null;
    if (at === null || !ref) return null;
    const typeId = String(ref.typeId || '').trim();
    const instanceId = String(ref.instanceId || '').trim();
    if (!typeId || !instanceId) return null;
    const revisionId = ref.revisionId ? String(ref.revisionId) : '';
    return insertBlock({
      id: createBlockId('r'),
      kind: 'reference',
      ref: { typeId, instanceId, ...(revisionId ? { revisionId } : {}) }
    }, at);
  }

  function openGraphOutputPicker(at) {
    graphOutputPickerAt.value = at;
  }

  function openGraphOutputPickerAfter(blockId) {
    const index = draftOrder.value.indexOf(blockId);
    openGraphOutputPicker(index < 0 ? draftOrder.value.length : index + 1);
  }

  function openGraphOutputPickerAtEnd() {
    openGraphOutputPicker(draftOrder.value.length);
  }

  function closeGraphOutputPicker() {
    graphOutputPickerAt.value = null;
  }

  function pickGraphOutput(collection = {}) {
    const at = graphOutputPickerAt.value;
    graphOutputPickerAt.value = null;
    if (at === null || !collection) return null;
    const source = collection.source && typeof collection.source === 'object' ? collection.source : {};
    if (source.kind !== 'graph-output' || !source.executionInstanceId || !source.outputId) return null;
    const frozen = collection.snapshot && typeof collection.snapshot === 'object' && Array.isArray(collection.snapshot.items);
    return insertBlock({
      id: createBlockId('c'),
      kind: 'collection',
      collection: {
        source: { ...source },
        parameters: collection.parameters || {},
        ...(frozen ? { snapshot: collection.snapshot } : {}),
        resultPolicy: frozen ? 'frozen' : 'pinned'
      }
    }, at);
  }

  function removeBlock(blockId) {
    draftBlocks.value = draftBlocks.value.filter(block => block.id !== blockId);
    draftOrder.value = draftOrder.value.filter(key => key !== blockId);
    if (editingBlockId.value === blockId) {
      editingBlockId.value = null;
      editingInitialBlock.value = '';
    }
    if (activeBlockId.value === blockId) activeBlockId.value = null;
    ensureTrailingTextBlock();
    markDirty();
  }

  function removeEmptyBlock(blockId) {
    const index = draftOrder.value.indexOf(blockId);
    if (index < 0) return;
    const previous = draftOrder.value.slice(0, index)
      .reverse()
      .find(key => blockById.value.get(key)?.kind === 'text');
    removeBlock(blockId);
    if (previous) {
      editingInitialBlock.value = '';
      editingCaret.value = 'end';
      editingBlockId.value = previous;
    }
  }

  function moveCaret(blockId, direction = 'down') {
    const forward = direction === 'down' || direction === 'right';
    const start = draftOrder.value.indexOf(blockId);
    if (start < 0) return false;
    for (let index = start + (forward ? 1 : -1); index >= 0 && index < draftOrder.value.length; index += forward ? 1 : -1) {
      const key = draftOrder.value[index];
      if (blockById.value.get(key)?.kind !== 'text') continue;
      editingInitialBlock.value = '';
      editingCaret.value = forward ? 'start' : 'end';
      editingBlockId.value = key;
      return true;
    }
    return false;
  }

  function resumeLastTextBlock() {
    const id = [...draftOrder.value].reverse()
      .find(key => blockById.value.get(key)?.kind === 'text');
    if (!id) return false;
    editingInitialBlock.value = '';
    editingCaret.value = 'end';
    editingBlockId.value = id;
    return true;
  }

  function updateText(blockId, text) {
    draftBlocks.value = draftBlocks.value.map(block => (block.id === blockId ? { ...block, text } : block));
    ensureTrailingTextBlock();
    markDirty();
  }

  async function save() {
    if (!dirty.value || saving.value || !id.value) return false;
    saving.value = true;
    try {
      await pagesStore.saveDocument(id.value, {
        blocks: draftBlocks.value,
        order: draftOrder.value
      });
      dirty.value = false;
      setWorkspacePageDirty(tabKey, false);
      return true;
    } finally {
      saving.value = false;
    }
  }

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

  return reactive({
    loaded,
    writable: true,
    dirty,
    saving,
    blocks: computed(() => draftBlocks.value),
    order: computed(() => draftOrder.value),
    blockByKey: key => blockById.value.get(key) || null,
    isTrailingBlock: key => key === draftOrder.value[draftOrder.value.length - 1]
      && isEmptyText(blockById.value.get(key)),
    editingBlockId: computed(() => editingBlockId.value),
    caretFor: blockId => (editingBlockId.value === blockId ? editingCaret.value : 'start'),
    activeBlockId: computed(() => activeBlockId.value),
    activateBlock: blockId => { activeBlockId.value = blockId; },
    deactivateBlock: blockId => { if (activeBlockId.value === blockId) activeBlockId.value = null; },
    initialBlockFor: blockId => (editingBlockId.value === blockId ? editingInitialBlock.value : ''),
    dragKey: computed(() => dragKey.value),
    beginDrag: key => { dragKey.value = key; },
    endDrag: () => { dragKey.value = null; },
    viewPickerAt: computed(() => viewPickerAt.value),
    referencePickerAt: computed(() => referencePickerAt.value),
    graphOutputPickerAt: computed(() => graphOutputPickerAt.value),
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
    openReferencePicker,
    openReferencePickerAfter,
    openReferencePickerAtEnd,
    closeReferencePicker,
    pickReference,
    openGraphOutputPicker,
    openGraphOutputPickerAfter,
    openGraphOutputPickerAtEnd,
    closeGraphOutputPicker,
    pickGraphOutput,
    moveCaret,
    removeBlock,
    removeEmptyBlock,
    resumeLastTextBlock,
    updateText,
    editBlock: blockId => {
      editingInitialBlock.value = '';
      editingCaret.value = 'start';
      editingBlockId.value = blockId;
    },
    closeEditor: () => {
      const blockId = editingBlockId.value;
      editingBlockId.value = null;
      editingInitialBlock.value = '';
      const block = blockById.value.get(blockId);
      if (block?.kind === 'text' && !String(block.text || '').trim()) removeBlock(blockId);
    },
    save
  });
}
