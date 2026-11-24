import { computed, nextTick, onScopeDispose, reactive, ref, unref, watch } from 'vue';
import { usePagesStore } from '~/stores/pages';
import { createBlockId } from '#shared/page-document.js';
import { setWorkspacePageDirty } from '~/utils/workspace-page-dirty.js';
import { usePageCollab } from './usePageCollab.js';

// The Page document authoring session (SPEC §26): ordered text and
// collection blocks, autosaved through the pages API. The block list, the
// text-block editors, the insert controls, and the collection picker bind
// to this one state home.
export function usePageDocumentSession({ docId, tabKey }) {
  const pagesStore = usePagesStore();
  const id = computed(() => String(unref(docId) || ''));
  const document = computed(() => pagesStore.documents[id.value] || { blocks: [], order: [] });
  const loaded = computed(() => Boolean(id.value) && id.value in pagesStore.documents);
  const collab = usePageCollab({ docId: id, tabKey });
  const textEditors = new Map();
  let structureReady = false;

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

  // A stored document may carry empty text blocks; the trailing line owns
  // the document's tail, so the seed drops them all.
  function seedDraft(value) {
    const blocks = (value.blocks || []).map(block => ({ ...block }));
    const byId = new Map(blocks.map(block => [block.id, block]));
    const order = (value.order || []).filter(key => !isEmptyText(byId.get(key)));
    for (const key of order) {
      const block = byId.get(key);
      if (block) block.text = String(block.text || '');
    }
    draftBlocks.value = blocks.filter(block => !isEmptyText(block));
    draftOrder.value = order;
  }

  watch(document, value => {
    if (dirty.value) return;
    const key = JSON.stringify(value);
    if (key === seededDocument) return;
    seededDocument = key;
    seedDraft(value);
  }, { immediate: true, deep: true });

  function applyStructure({ order = [], blocks = [] } = {}) {
    const storedById = new Map(blocks
      .filter(block => block && block.id)
      .map(block => [String(block.id), { ...block }]));
    const nextBlocks = [];
    const nextOrder = [];
    for (const key of order) {
      const stored = storedById.get(String(key));
      if (!stored) continue;
      const current = blockById.value.get(String(key));
      if (stored.kind === 'text' && current?.kind === 'text') stored.text = current.text;
      nextBlocks.push(stored);
      nextOrder.push(String(key));
    }
    const next = new Set(nextOrder);
    for (const key of blockById.value.keys()) {
      if (!next.has(key)) collab.closeBlock?.(key);
    }
    draftBlocks.value = nextBlocks;
    draftOrder.value = nextOrder;
    if (editingBlockId.value && !nextOrder.includes(editingBlockId.value)) {
      editingBlockId.value = null;
      editingInitialBlock.value = '';
    }
    if (activeBlockId.value && !nextOrder.includes(activeBlockId.value)) activeBlockId.value = null;
  }

  let startedCollab = false;
  async function startCollab() {
    if (startedCollab || !loaded.value) return;
    startedCollab = true;
    await collab.start({
      seed: doc => {
        const order = doc.getArray('order');
        const blocks = doc.getMap('blocks');
        const keys = draftOrder.value.filter(key => blockById.value.has(key));
        order.insert(0, keys);
        for (const key of keys) {
          blocks.set(key, JSON.parse(JSON.stringify(blockById.value.get(key))));
        }
      },
      apply: applyStructure
    });
  }

  watch(loaded, value => {
    if (value) startCollab().catch(() => {});
  }, { immediate: true });

  function move(key, direction) {
    const index = draftOrder.value.indexOf(key);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= draftOrder.value.length) return;
    const next = [...draftOrder.value];
    [next[index], next[target]] = [next[target], next[index]];
    draftOrder.value = next;
    collab.move(key, direction);
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
    collab.moveToIndex(key, targetIndex);
    markDirty();
  }

  function insertBlock(block, at) {
    draftBlocks.value = [...draftBlocks.value, block];
    const index = Math.max(0, Math.min(at, draftOrder.value.length));
    draftOrder.value = [...draftOrder.value.slice(0, index), block.id, ...draftOrder.value.slice(index)];
    collab.insertBlock(block, index);
    markDirty();
    return block.id;
  }

  function insertText(at, initialBlock = '', text = '') {
    const block = { id: createBlockId('t'), kind: 'text', text: String(text || '') };
    const id = insertBlock(block, at);
    editingInitialBlock.value = initialBlock;
    editingCaret.value = 'start';
    editingBlockId.value = id;
    return id;
  }

  function insertTextAfter(blockId, initialBlock = 'paragraph', text = '') {
    const index = draftOrder.value.indexOf(blockId);
    if (index < 0) return null;
    return insertText(index + 1, initialBlock, text);
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

  function insertReference(ref = {}, at = draftOrder.value.length) {
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

  function insertReferenceAfter(blockId, ref = {}) {
    const index = draftOrder.value.indexOf(blockId);
    return insertReference(ref, index < 0 ? draftOrder.value.length : index + 1);
  }

  function insertReferenceAtEnd(ref = {}) {
    return insertReference(ref, draftOrder.value.length);
  }

  function pickReference(ref = {}) {
    const at = referencePickerAt.value;
    referencePickerAt.value = null;
    if (at === null || !ref) return null;
    return insertReference(ref, at);
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
    collab.removeBlock(blockId);
    markDirty();
  }

  function previousTextBlock(blockId) {
    const index = draftOrder.value.indexOf(blockId);
    if (index < 0) return null;
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const key = draftOrder.value[cursor];
      if (blockById.value.get(key)?.kind === 'text') return key;
    }
    return null;
  }

  function nextTextBlock(blockId) {
    const index = draftOrder.value.indexOf(blockId);
    if (index < 0) return null;
    for (let cursor = index + 1; cursor < draftOrder.value.length; cursor += 1) {
      const key = draftOrder.value[cursor];
      if (blockById.value.get(key)?.kind === 'text') return key;
    }
    return null;
  }

  function removeEmptyBlock(blockId) {
    const previous = previousTextBlock(blockId);
    removeBlock(blockId);
    if (previous) {
      editingInitialBlock.value = '';
      editingCaret.value = 'end';
      editingBlockId.value = previous;
    }
  }

  function splitBlock(blockId, after = '') {
    const index = draftOrder.value.indexOf(blockId);
    if (index < 0) return null;
    return insertText(index + 1, '', after);
  }

  function mergeWithPrevious(blockId) {
    const previous = previousTextBlock(blockId);
    if (!previous) return false;
    const current = blockById.value.get(blockId);
    const markdown = textEditors.get(blockId)?.getMarkdown?.() ?? current?.text ?? '';
    const target = textEditors.get(previous);
    if (target?.appendMarkdown) {
      target.appendMarkdown(markdown);
    } else {
      const previousBlock = blockById.value.get(previous);
      updateText(previous, `${previousBlock?.text || ''}${markdown}`);
    }
    removeBlock(blockId);
    return true;
  }

  function mergeNext(blockId) {
    const next = nextTextBlock(blockId);
    if (!next) return false;
    const nextBlock = blockById.value.get(next);
    const markdown = textEditors.get(next)?.getMarkdown?.() ?? nextBlock?.text ?? '';
    const target = textEditors.get(blockId);
    if (target?.appendMarkdown) target.appendMarkdown(markdown);
    else updateText(blockId, `${blockById.value.get(blockId)?.text || ''}${markdown}`);
    removeBlock(next);
    return true;
  }

  function registerTextEditor(blockId, api) {
    if (blockId && api) textEditors.set(blockId, api);
  }

  function unregisterTextEditor(blockId) {
    textEditors.delete(blockId);
  }

  function pruneEmptyTextBlocks() {
    const emptyIds = draftOrder.value.filter(key => isEmptyText(blockById.value.get(key)));
    if (!emptyIds.length) return;
    const empty = new Set(emptyIds);
    draftBlocks.value = draftBlocks.value.filter(block => !empty.has(block.id));
    draftOrder.value = draftOrder.value.filter(key => !empty.has(key));
    for (const key of emptyIds) {
      collab.closeBlock?.(key);
      collab.removeBlock(key);
    }
    if (empty.has(editingBlockId.value)) {
      editingBlockId.value = null;
      editingInitialBlock.value = '';
    }
    if (empty.has(activeBlockId.value)) activeBlockId.value = null;
    markDirty();
  }

  function releaseFocus(blockId) {
    if (activeBlockId.value === blockId) activeBlockId.value = null;
    if (editingBlockId.value === blockId) {
      editingBlockId.value = null;
      editingInitialBlock.value = '';
    }
    nextTick(() => {
      if (activeBlockId.value || editingBlockId.value) return;
      pruneEmptyTextBlocks();
    });
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
    markDirty();
  }

  function draftSignature() {
    return JSON.stringify({ blocks: draftBlocks.value, order: draftOrder.value });
  }

  let autosaveTimer = null;
  function scheduleAutosave() {
    if (!dirty.value) return;
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      autosaveTimer = null;
      save().catch(() => {});
    }, 1500);
  }

  function collectTextMarkdown() {
    let changed = false;
    const next = draftBlocks.value.map(block => {
      if (block.kind !== 'text') return block;
      const markdown = textEditors.get(block.id)?.getMarkdown?.();
      if (typeof markdown !== 'string' || markdown === block.text) return block;
      changed = true;
      return { ...block, text: markdown };
    });
    if (changed) draftBlocks.value = next;
  }

  async function save() {
    if (!dirty.value || saving.value || !id.value) return false;
    saving.value = true;
    if (collab.active()) {
      try {
        await collab.syncAll();
        await nextTick();
      } catch {
        /* the draft saves locally while the collaboration transport heals */
      }
    }
    collectTextMarkdown();
    const submittedSignature = draftSignature();
    // Persistence receives an isolated JSON snapshot; nested collection/view
    // payloads must not remain aliased to the live reactive draft.
    const snapshot = JSON.parse(JSON.stringify({
      blocks: draftBlocks.value,
      order: draftOrder.value
    }));
    try {
      await pagesStore.saveDocument(id.value, snapshot);
      if (draftSignature() === submittedSignature) {
        dirty.value = false;
        setWorkspacePageDirty(tabKey, false);
      }
      return true;
    } finally {
      saving.value = false;
      if (dirty.value) scheduleAutosave();
    }
  }

  watch([draftBlocks, draftOrder], () => {
    if (dirty.value) scheduleAutosave();
  }, { deep: true });
  onScopeDispose(() => {
    if (autosaveTimer) clearTimeout(autosaveTimer);
  });

  return reactive({
    loaded,
    writable: true,
    collabReady: collab.ready,
    dirty,
    saving,
    blocks: computed(() => draftBlocks.value),
    order: computed(() => draftOrder.value),
    blockByKey: key => blockById.value.get(key) || null,
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
    insertReference,
    insertReferenceAfter,
    insertReferenceAtEnd,
    openGraphOutputPicker,
    openGraphOutputPickerAfter,
    openGraphOutputPickerAtEnd,
    closeGraphOutputPicker,
    pickGraphOutput,
    moveCaret,
    removeBlock,
    removeEmptyBlock,
    splitBlock,
    mergeWithPrevious,
    mergeNext,
    registerTextEditor,
    unregisterTextEditor,
    releaseFocus,
    openTextCollab: collab.textBlock,
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
      nextTick(pruneEmptyTextBlocks);
    },
    save
  });
}
