// The Page document picker contract (SPEC §27.1): reference and graph
// result blocks insert at the position their picker was opened at; a
// closed picker inserts nothing. The seed drops trailing empty text
// blocks — the trailing line owns the document's tail.
import { nextTick, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pageMocks = vi.hoisted(() => ({ saveDocument: vi.fn(async () => {}) }));

vi.mock('~/stores/pages.js', () => ({
  usePagesStore: () => ({
    documents: {
      page1: {
        blocks: [
          { id: 't1', kind: 'text', text: 'first' },
          { id: 't2', kind: 'text', text: 'second' }
        ],
        order: ['t1', 't2']
      },
      page2: {
        blocks: [
          { id: 'a1', kind: 'text', text: 'body' },
          { id: 'e1', kind: 'text', text: '' },
          { id: 'e2', kind: 'text', text: '   ' }
        ],
        order: ['a1', 'e1', 'e2']
      }
    },
    saveDocument: pageMocks.saveDocument
  })
}));

vi.mock('~/utils/workspace-page-dirty.js', () => ({
  setWorkspacePageDirty: vi.fn()
}));

import { usePageDocumentSession } from './usePageDocument.js';

function session(docId = 'page1') {
  return usePageDocumentSession({ docId: ref(docId), tabKey: 'tab' });
}

function kinds(order, block) {
  return order.map(key => block(key)?.kind);
}

describe('usePageDocumentSession pickers', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('seeds the draft from the stored document', () => {
    const doc = session();
    expect(kinds(doc.order, doc.blockByKey)).toEqual(['text', 'text']);
  });

  it('keeps edits made during a save dirty and autosaves the newer snapshot', async () => {
    vi.useFakeTimers();
    let resolveFirstSave;
    pageMocks.saveDocument.mockImplementationOnce(() => new Promise(resolve => {
      resolveFirstSave = resolve;
    }));
    const doc = session();
    doc.appendTextBlock('submitted');
    await nextTick();
    const saving = doc.save();
    doc.appendTextBlock('newer edit');
    await nextTick();
    resolveFirstSave();
    await saving;

    expect(doc.dirty).toBe(true);
    await vi.advanceTimersByTimeAsync(1500);
    expect(pageMocks.saveDocument).toHaveBeenCalledTimes(2);
    const secondSnapshot = pageMocks.saveDocument.mock.calls[1][1];
    expect(secondSnapshot.blocks.some(block => block.text === 'newer edit')).toBe(true);
    expect(doc.dirty).toBe(false);
    vi.useRealTimers();
  });

  it('isolates nested block payloads in an in-flight save snapshot', async () => {
    vi.useFakeTimers();
    let resolveSave;
    pageMocks.saveDocument.mockImplementationOnce(() => new Promise(resolve => {
      resolveSave = resolve;
    }));
    const doc = session();
    doc.openGraphOutputPickerAtEnd();
    const blockId = doc.pickGraphOutput({
      source: { kind: 'graph-output', executionInstanceId: 'e-1', outputId: 'o-1', graphId: 'g-1' },
      parameters: { nested: { value: 1 } }
    });
    await nextTick();
    const saving = doc.save();
    doc.blockByKey(blockId).collection.parameters.nested.value = 2;
    await nextTick();

    const submitted = pageMocks.saveDocument.mock.calls[0][1];
    expect(submitted.blocks.find(block => block.id === blockId).collection.parameters.nested.value).toBe(1);
    resolveSave();
    await saving;
    expect(doc.dirty).toBe(true);
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('drops trailing empty text blocks on the seed', () => {
    const doc = session('page2');
    expect(kinds(doc.order, doc.blockByKey)).toEqual(['text']);
    expect(doc.order).toEqual(['a1']);
  });

  it('inserts a live reference block at the opened position', () => {
    const doc = session();
    doc.openReferencePickerAfter('t1');
    expect(doc.referencePickerAt).toBe(1);
    doc.pickReference({ typeId: 'task', instanceId: 'i-1' });
    expect(doc.referencePickerAt).toBeNull();
    expect(kinds(doc.order, doc.blockByKey)).toEqual(['text', 'reference', 'text']);
    const inserted = doc.order.map(key => doc.blockByKey(key)).find(block => block.kind === 'reference');
    expect(inserted.ref).toEqual({ typeId: 'task', instanceId: 'i-1' });
    expect(doc.dirty).toBe(true);
  });

  it('carries the picked revision on a pinned reference', () => {
    const doc = session();
    doc.openReferencePickerAtEnd();
    doc.pickReference({ typeId: 'task', instanceId: 'i-1', revisionId: 'r-9' });
    const inserted = doc.order.map(key => doc.blockByKey(key)).find(block => block.kind === 'reference');
    expect(inserted.ref).toEqual({ typeId: 'task', instanceId: 'i-1', revisionId: 'r-9' });
  });

  it('inserts a created graph reference after the active block', () => {
    const doc = session();
    doc.insertReferenceAfter('t1', { typeId: 'graph-document', instanceId: 'g-1', name: 'Graph' });
    expect(kinds(doc.order, doc.blockByKey)).toEqual(['text', 'reference', 'text']);
    const inserted = doc.order.map(key => doc.blockByKey(key)).find(block => block.kind === 'reference');
    expect(inserted.ref).toEqual({ typeId: 'graph-document', instanceId: 'g-1' });
    expect(doc.dirty).toBe(true);
  });

  it('refuses an identity-less reference and keeps the draft clean', () => {
    const doc = session();
    doc.openReferencePickerAtEnd();
    expect(doc.pickReference({ typeId: 'task' })).toBeNull();
    expect(kinds(doc.order, doc.blockByKey)).toEqual(['text', 'text']);
  });

  it('inserts nothing once the picker is closed', () => {
    const doc = session();
    doc.openReferencePickerAtEnd();
    doc.closeReferencePicker();
    doc.pickReference({ typeId: 'task', instanceId: 'i-1' });
    expect(kinds(doc.order, doc.blockByKey)).toEqual(['text', 'text']);
  });

  it('inserts a pinned graph-result block at the opened position', () => {
    const doc = session();
    doc.openGraphOutputPicker(0);
    expect(doc.graphOutputPickerAt).toBe(0);
    doc.pickGraphOutput({
      source: { kind: 'graph-output', executionInstanceId: 'e-1', outputId: 'o-1', graphId: 'g-1' },
      parameters: { limit: 5 }
    });
    expect(doc.graphOutputPickerAt).toBeNull();
    expect(kinds(doc.order, doc.blockByKey)).toEqual(['collection', 'text', 'text']);
    const inserted = doc.order.map(key => doc.blockByKey(key)).find(block => block.kind === 'collection');
    expect(inserted.collection).toEqual({
      source: { kind: 'graph-output', executionInstanceId: 'e-1', outputId: 'o-1', graphId: 'g-1' },
      parameters: { limit: 5 },
      resultPolicy: 'pinned'
    });
  });

  it('refuses a graph result without a complete source', () => {
    const doc = session();
    doc.openGraphOutputPickerAtEnd();
    expect(doc.pickGraphOutput({ source: { kind: 'graph-output', executionInstanceId: 'e-1' } })).toBeNull();
    expect(kinds(doc.order, doc.blockByKey)).toEqual(['text', 'text']);
  });
});
