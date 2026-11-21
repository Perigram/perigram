// The Page document picker contract (SPEC §27.1): reference and graph
// result blocks insert at the position their picker was opened at; a
// closed picker inserts nothing. The seed drops trailing empty text
// blocks — the trailing line owns the document's tail.
import { ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    saveDocument: vi.fn(async () => {})
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
  });

  it('seeds the draft from the stored document', () => {
    const doc = session();
    expect(kinds(doc.order, doc.blockByKey)).toEqual(['text', 'text']);
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
