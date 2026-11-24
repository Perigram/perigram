import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  publish: vi.fn(),
  registerTopicAuthorizer: vi.fn()
}));

vi.mock('./repository.js', () => ({ findById: mocks.findById }));
vi.mock('../connections/service.js', () => ({
  publish: mocks.publish,
  registerTopicAuthorizer: mocks.registerTopicAuthorizer
}));

import { __clearCollabForTests, handleCollab, registerPageCollabTopicAuthorizer } from './collab.js';

const auth = { userId: 'user-1', organizationId: 'org-1' };
const pageId = 'page-1';

function base64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

function docUpdate(doc) {
  return base64(Y.encodeStateAsUpdate(doc));
}

function textOf(update) {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, Buffer.from(update, 'base64'));
  const text = doc.getText('body').toString();
  doc.destroy();
  return text;
}

describe('page collaboration transport', () => {
  beforeEach(() => {
    __clearCollabForTests();
    mocks.findById.mockReset();
    mocks.publish.mockReset();
    mocks.registerTopicAuthorizer.mockReset();
    mocks.findById.mockResolvedValue({ _id: pageId, organizationId: 'org-1' });
  });

  it('leases an uninitialized document to one owner and makes later claims wait', async () => {
    const first = await handleCollab(pageId, { op: 'claim', doc: 'block:b1', clientToken: 'client-a' }, auth);
    const second = await handleCollab(pageId, { op: 'claim', doc: 'block:b1', clientToken: 'client-b' }, auth);
    expect(first).toEqual({ owner: true, initialized: false });
    expect(second.owner).toBe(false);
    expect(second.initialized).toBe(false);
    expect(second.retryAfter).toBeGreaterThan(0);
  });

  it('seeds the document once, answers sync with the missing state, and publishes the update', async () => {
    await handleCollab(pageId, { op: 'claim', doc: 'block:b1', clientToken: 'client-a' }, auth);
    const source = new Y.Doc();
    source.getText('body').insert(0, 'hello');
    await handleCollab(pageId, {
      op: 'update',
      doc: 'block:b1',
      clientToken: 'client-a',
      seed: true,
      update: docUpdate(source)
    }, auth);
    source.destroy();

    const initial = await handleCollab(pageId, { op: 'sync', doc: 'block:b1', stateVector: '' }, auth);
    expect(initial.initialized).toBe(true);
    expect(textOf(initial.update)).toBe('hello');
    expect(mocks.publish).toHaveBeenCalledWith(
      `page:${pageId}`,
      expect.objectContaining({ type: 'yjs', doc: 'block:b1', clientToken: 'client-a' })
    );

    const claim = await handleCollab(pageId, { op: 'claim', doc: 'block:b1', clientToken: 'client-b' }, auth);
    expect(claim).toEqual({ owner: false, initialized: true });
  });

  it('relays awareness without storing it', async () => {
    const awareness = new Uint8Array([1, 2, 3]);
    const result = await handleCollab(pageId, {
      op: 'awareness',
      doc: 'block:b1',
      clientToken: 'client-a',
      awareness: base64(awareness)
    }, auth);
    expect(result).toEqual({ ok: true });
    expect(mocks.publish).toHaveBeenCalledWith(
      `page:${pageId}`,
      expect.objectContaining({ type: 'awareness', doc: 'block:b1', awareness: base64(awareness) })
    );
  });

  it('refuses foreign organizations and unknown document names', async () => {
    await expect(handleCollab(pageId, { op: 'claim', doc: 'block:b1', clientToken: 'c' }, { userId: 'u', organizationId: 'org-2' }))
      .rejects.toMatchObject({ statusCode: 404 });
    await expect(handleCollab(pageId, { op: 'claim', doc: 'other', clientToken: 'c' }, auth))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('registers the page topic authorizer with the connections layer', () => {
    registerPageCollabTopicAuthorizer();
    expect(mocks.registerTopicAuthorizer).toHaveBeenCalledWith('page:', expect.any(Function));
  });
});
