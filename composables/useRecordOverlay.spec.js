// The overlay authoring session's state machine (SPEC §26): draft
// seeding from saved state, move/insert/remove over the draft order,
// the trivial-draft delete, and the edit-of-a-saved-block seeding law.
import { computed, nextTick, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/components/generated/file-surfaces.js', () => ({
  editorWriteGranted: () => true
}));

const savedOverlay = ref(null);

vi.mock('~/stores/instance-overlays.js', () => ({
  useInstanceOverlaysStore: () => ({
    overlayFor: () => savedOverlay.value,
    loadedFor: () => true,
    save: async (typeId, instanceId, doc) => {
      lastSaved = doc;
      savedOverlay.value = { blocks: doc.blocks.map(block => ({ ...block })), order: [...doc.order] };
      return { typeId, instanceId, ...doc };
    },
    remove: async () => {
      removed = true;
      savedOverlay.value = null;
    }
  })
}));

let lastSaved = null;
let removed = false;

import { useRecordOverlaySession } from './useRecordOverlay.js';

function session() {
  return useRecordOverlaySession({
    typeId: ref('queue'),
    instanceId: ref('q1'),
    entity: ref({ _id: 'q1' }),
    active: ref(true),
    tabKey: 'page:queue:q1'
  });
}

describe('useRecordOverlaySession', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    lastSaved = null;
    removed = false;
  });

  it('editing a saved block seeds the draft so keystrokes land', async () => {
    savedOverlay.value = {
      blocks: [{ id: 'b1', kind: 'text', text: 'saved words' }],
      order: ['properties', 'b1']
    };
    const s = session();
    s.syncFlow(['properties', 'b1'], ['properties']);
    expect(s.dirty).toBe(false);
    s.editBlock('b1');
    expect(s.dirty).toBe(true);
    s.updateText('b1', 'saved words and more');
    await nextTick();
    expect(s.applied.blocks[0].text).toBe('saved words and more');
  });

  it('moves reorder the draft order alone', () => {
    savedOverlay.value = null;
    const s = session();
    s.syncFlow(['properties', 'children:notes'], ['properties', 'children:notes']);
    s.move('children:notes', -1);
    expect(s.applied.order).toEqual(['children:notes', 'properties']);
    expect(s.dirty).toBe(true);
  });

  it('insert and remove keep blocks and order in step', () => {
    savedOverlay.value = null;
    const s = session();
    s.syncFlow(['properties'], ['properties']);
    s.insertText(1);
    const block = s.applied.blocks[0];
    expect(s.applied.order).toEqual(['properties', block.id]);
    s.insertText(0);
    const head = s.applied.blocks[1];
    expect(s.applied.order).toEqual([head.id, 'properties', block.id]);
    s.removeBlock(head.id);
    expect(s.applied.order).toEqual(['properties', block.id]);
    s.removeBlock(block.id);
    expect(s.applied.blocks).toEqual([]);
    expect(s.applied.order).toEqual(['properties']);
  });

  it('mutations proceed once the draft is seeded', () => {
    savedOverlay.value = null;
    const s = session();
    s.syncFlow(['properties'], ['properties']);
    s.insertText(1);
    s.insertText(1);
    expect(s.applied.blocks.length).toBe(2);
    const moved = s.applied.order[1];
    s.move(moved, -1);
    expect(s.applied.order[0]).toBe(moved);
  });

  it('drag moves a section to the drop index', () => {
    savedOverlay.value = null;
    const s = session();
    s.syncFlow(['properties', 'children:a', 'children:b'], ['properties', 'children:a', 'children:b']);
    s.moveToIndex('children:b', 0);
    expect(s.applied.order).toEqual(['children:b', 'properties', 'children:a']);
    s.moveToIndex('children:b', 3);
    expect(s.applied.order).toEqual(['properties', 'children:a', 'children:b']);
  });

  it('a trivial draft saves as a delete', async () => {
    savedOverlay.value = {
      blocks: [{ id: 'b1', kind: 'text', text: 'gone' }],
      order: ['b1', 'properties']
    };
    const s = session();
    s.syncFlow(['properties', 'b1'], ['properties']);
    s.editBlock('b1');
    s.removeBlock('b1');
    await s.save();
    expect(removed).toBe(true);
    expect(lastSaved).toBe(null);
    expect(s.dirty).toBe(false);
  });

  it('closing an empty new block drops it', () => {
    savedOverlay.value = null;
    const s = session();
    s.syncFlow(['properties'], ['properties']);
    s.insertText(1);
    const id = s.applied.blocks[0].id;
    s.closeEditor();
    expect(s.editingBlockId).toBe(null);
    expect(s.applied.blocks).toEqual([]);
    expect(s.applied.order).toEqual(['properties']);
    expect(id).toBeTruthy();
  });

  it('backspace on an empty block removes it and resumes the previous text block', () => {
    savedOverlay.value = {
      blocks: [{ id: 'b1', kind: 'text', text: 'words' }],
      order: ['properties', 'b1']
    };
    const s = session();
    s.syncFlow(['properties', 'b1'], ['properties']);
    s.insertTextAfter('b1');
    const empty = s.applied.blocks[1].id;
    s.removeEmptyBlock(empty);
    expect(s.applied.blocks.map(block => block.id)).toEqual(['b1']);
    expect(s.applied.order).toEqual(['properties', 'b1']);
    expect(s.editingBlockId).toBe('b1');
  });

  it('trailing Backspace resumes the last text block', () => {
    savedOverlay.value = {
      blocks: [
        { id: 'b1', kind: 'text', text: 'first' },
        { id: 'b2', kind: 'view', view: { typeId: 'widget', name: 'Widgets' } }
      ],
      order: ['properties', 'b1', 'b2']
    };
    const s = session();
    s.syncFlow(['properties', 'b1', 'b2'], ['properties']);
    expect(s.resumeLastTextBlock()).toBe(true);
    expect(s.editingBlockId).toBe('b1');
    expect(s.initialBlockFor('b1')).toBe('');
  });

  it('trailing Backspace without a text block keeps the editor closed', () => {
    savedOverlay.value = {
      blocks: [{ id: 'b1', kind: 'view', view: { typeId: 'widget', name: 'Widgets' } }],
      order: ['properties', 'b1']
    };
    const s = session();
    s.syncFlow(['properties', 'b1'], ['properties']);
    expect(s.resumeLastTextBlock()).toBe(false);
    expect(s.editingBlockId).toBe(null);
  });

  it('appends the trailing line text as a block', () => {
    savedOverlay.value = null;
    const s = session();
    s.syncFlow(['properties'], ['properties']);
    s.appendTextBlock('Bottom note');
    expect(s.applied.blocks).toHaveLength(1);
    expect(s.applied.blocks[0].text).toBe('Bottom note');
    expect(s.applied.order).toEqual(['properties', s.applied.blocks[0].id]);
  });

  it('a real draft saves the composed document', async () => {
    savedOverlay.value = null;
    const s = session();
    s.syncFlow(['properties'], ['properties']);
    s.insertText(null);
    s.updateText(s.applied.blocks[0].id, 'words');
    await s.save();
    expect(lastSaved.blocks[0].text).toBe('words');
    expect(s.dirty).toBe(false);
  });

  it('breaks a block by inserting the next text block after it', () => {
    savedOverlay.value = {
      blocks: [{ id: 'b1', kind: 'text', text: 'words' }],
      order: ['properties', 'b1']
    };
    const s = session();
    s.syncFlow(['properties', 'b1'], ['properties']);
    s.insertTextAfter('b1');
    expect(s.applied.order[0]).toBe('properties');
    expect(s.applied.order[1]).toBe('b1');
    expect(s.applied.order[2]).toBe(s.applied.blocks[1].id);
    expect(s.editingBlockId).toBe(s.applied.blocks[1].id);
  });

  it('an autosave keeps the block editor open and accepts the next edit', async () => {
    savedOverlay.value = {
      blocks: [{ id: 'b1', kind: 'text', text: 'saved words' }],
      order: ['properties', 'b1']
    };
    const s = session();
    s.syncFlow(['properties', 'b1'], ['properties']);
    s.editBlock('b1');
    s.updateText('b1', 'first edit');
    await s.save();
    expect(s.editingBlockId).toBe('b1');
    s.updateText('b1', 'second edit');
    expect(s.applied.blocks[0].text).toBe('second edit');
  });
});
