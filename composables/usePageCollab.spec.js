import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import * as Y from 'yjs';

const mockState = vi.hoisted(() => ({ handlers: new Set() }));

vi.mock('./useConnections.js', () => ({
  useConnections: () => ({
    epoch: { value: 0 },
    subscribe: (_topic, handler) => {
      mockState.handlers.add(handler);
      return () => mockState.handlers.delete(handler);
    }
  })
}));

vi.mock('~/stores/auth', () => ({
  useAuthStore: () => ({ userData: { name: 'Probe', userId: 'user-1' } })
}));

import { usePageCollab } from './usePageCollab.js';

const docs = new Map();
const leases = new Map();

function encode(bytes) {
  return Buffer.from(bytes).toString('base64');
}

function decode(value) {
  return new Uint8Array(Buffer.from(String(value || ''), 'base64'));
}

function entryFor(name) {
  let entry = docs.get(name);
  if (!entry) {
    entry = { doc: new Y.Doc(), initialized: false, owner: null };
    docs.set(name, entry);
  }
  return entry;
}

function broadcast(docName, update, clientToken) {
  for (const handler of mockState.handlers) {
    handler({ type: 'yjs', doc: docName, update: encode(update), clientToken });
  }
}

async function serverFetch(_url, options = {}) {
  const body = options.body || {};
  const entry = entryFor(body.doc);
  if (body.op === 'claim') {
    if (entry.initialized) return { owner: false, initialized: true };
    if (!entry.owner) {
      entry.owner = body.clientToken;
      leases.set(body.doc, body.clientToken);
      return { owner: true, initialized: false };
    }
    return { owner: false, initialized: false, retryAfter: 20 };
  }
  if (body.op === 'sync') {
    const vector = body.stateVector ? decode(body.stateVector) : undefined;
    return {
      initialized: entry.initialized,
      update: encode(Y.encodeStateAsUpdate(entry.doc, vector))
    };
  }
  if (body.op === 'update') {
    const update = decode(body.update);
    if (body.seed === true) {
      entry.doc.destroy();
      entry.doc = new Y.Doc();
      Y.applyUpdate(entry.doc, update);
      entry.initialized = true;
      entry.owner = null;
    } else {
      Y.applyUpdate(entry.doc, update);
    }
    broadcast(body.doc, update, body.clientToken);
    return { ok: true };
  }
  if (body.op === 'awareness') {
    for (const handler of mockState.handlers) {
      handler({ type: 'awareness', doc: body.doc, awareness: body.awareness, clientToken: body.clientToken });
    }
    return { ok: true };
  }
  throw new Error(`unknown op ${body.op}`);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('usePageCollab', () => {
  beforeEach(() => {
    docs.clear();
    leases.clear();
    mockState.handlers.clear();
    globalThis.window = {};
    globalThis.$fetch = vi.fn(serverFetch);
  });

  it('seeds the structure once and mirrors block changes into the second session', async () => {
    let first = null;
    let second = null;
    const a = usePageCollab({ docId: ref('page-1') });
    await a.start({
      seed: doc => {
        doc.getArray('order').insert(0, ['t1']);
        doc.getMap('blocks').set('t1', { id: 't1', kind: 'text', text: 'hello' });
      },
      apply: snapshot => { first = snapshot; }
    });
    expect(first.order).toEqual(['t1']);
    expect(first.blocks[0].text).toBe('hello');
    await wait(20);

    const b = usePageCollab({ docId: ref('page-1') });
    await b.start({
      seed: () => { throw new Error('the second session seeds nothing'); },
      apply: snapshot => { second = snapshot; }
    });
    expect(second.order).toEqual(['t1']);
    expect(second.blocks[0].text).toBe('hello');

    a.insertBlock({ id: 't2', kind: 'text', text: 'next' }, 1);
    await wait(120);
    expect(second.order).toEqual(['t1', 't2']);

    a.removeBlock('t1');
    await wait(120);
    expect(second.order).toEqual(['t2']);
  });

  it('seeds a text document from its owner and syncs the waiting session', async () => {
    const a = usePageCollab({ docId: ref('page-2') });
    await a.start({
      seed: doc => doc.getArray('order').insert(0, ['t1']),
      apply: () => {}
    });
    const b = usePageCollab({ docId: ref('page-2') });
    await b.start({
      seed: doc => doc.getArray('order').insert(0, ['t1']),
      apply: () => {}
    });

    const first = a.textBlock('t1');
    await first.ready;
    expect(first.owner).toBe(true);
    first.doc.getText('body').insert(0, 'shared line');
    first.markSeeded();
    await wait(20);

    const second = b.textBlock('t1');
    await second.ready;
    expect(second.owner).toBe(false);
    expect(second.doc.getText('body').toString()).toBe('shared line');
  });
});
