import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { ref } from 'vue';
import { useRemoteDocumentSync } from './useRemoteDocumentSync.js';
import { emitInstanceMutation } from '#utils/instance-events.js';

// The editors' remote reconciliation contract: a clean editor reloads
// on a remote save, a dirty one raises the affordance, and neither own
// publications nor renames ever touch the document.

const persistence = {
  typeId: 'text-document',
  instanceId: 't-1',
  origin: 'persistence:text-document:t-1'
};

function harness({ dirty = false } = {}) {
  const dirtyRef = ref(dirty);
  const reload = vi.fn(async () => {});
  const sync = useRemoteDocumentSync(persistence, { dirty: dirtyRef, reload });
  return { dirtyRef, reload, sync };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('remote document sync', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.stubGlobal('window', new EventTarget());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reloads a clean editor on a remote save', async () => {
    const { reload, sync } = harness();
    emitInstanceMutation({ type: 'text-document', id: 't-1', change: 'updated', reason: 'payload-save', source: 'local' });
    await settle();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sync.remoteChanged.value).toBe(false);
  });

  it('raises the affordance instead of reloading a dirty editor', async () => {
    const { reload, sync } = harness({ dirty: true });
    emitInstanceMutation({ type: 'text-document', id: 't-1', change: 'updated', reason: 'payload-save', source: 'server' });
    await settle();
    expect(reload).not.toHaveBeenCalled();
    expect(sync.remoteChanged.value).toBe(true);

    await sync.reloadFromRemote();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sync.remoteChanged.value).toBe(false);
  });

  it('skips its own publications through the origin token', async () => {
    const { reload } = harness();
    emitInstanceMutation({ type: 'text-document', id: 't-1', reason: 'payload-save', source: 'local', origin: persistence.origin });
    await settle();
    expect(reload).not.toHaveBeenCalled();
  });

  it('never reloads content for renames', async () => {
    const clean = harness();
    emitInstanceMutation({ type: 'text-document', id: 't-1', reason: 'editor-rename', source: 'local' });
    await settle();
    expect(clean.reload).not.toHaveBeenCalled();

    const dirty = harness({ dirty: true });
    emitInstanceMutation({ type: 'text-document', id: 't-1', reason: 'editor-rename', source: 'server' });
    await settle();
    expect(dirty.sync.remoteChanged.value).toBe(false);
  });

  it('ignores other instances and types', async () => {
    const { reload } = harness();
    emitInstanceMutation({ type: 'text-document', id: 't-other', reason: 'payload-save', source: 'server' });
    emitInstanceMutation({ type: 'csv-table', id: 't-1', reason: 'payload-save', source: 'server' });
    emitInstanceMutation({ type: 'text-document', id: 't-1', change: 'deleted', source: 'server' });
    await settle();
    expect(reload).not.toHaveBeenCalled();
  });
});
