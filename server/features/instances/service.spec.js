// Generic instance services (SPEC §13): pack types and org-authored types
// execute without hand-written feature services — per-class collections,
// type-discriminated documents, construction from the declaration.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const inserted = [];
const queries = [];

vi.mock('./repository.js', () => ({
  CLASS_COLLECTIONS: { file: 'files', item: 'items', group: 'groups', process: 'processes' },
  collectionForClass: cls => ({ file: 'files', item: 'items', group: 'groups', process: 'processes' }[cls] || 'files'),
  insertInstance: vi.fn(async (collection, doc) => {
    inserted.push({ collection, doc });
    return doc;
  }),
  listInstances: vi.fn(async (collection, typeId, organizationId) => {
    queries.push({ collection, filter: { type: typeId, 'lineage.organizationId': organizationId } });
    return [];
  }),
  findInstance: vi.fn(async () => null),
  findInstanceAnywhere: vi.fn(async () => null),
  updateInstanceBlocks: vi.fn(async () => null),
  deleteInstance: vi.fn(async () => true)
}));

vi.mock('../cts-types/repository.js', () => ({
  findByTypeId: vi.fn(async () => null)
}));

import { instanceServiceResolver } from './service.js';

beforeEach(() => {
  inserted.length = 0;
  queries.length = 0;
});

describe('generic instance services', () => {
  it('resolves a service for pack and org types, never for framework services', () => {
    const cassette = instanceServiceResolver('cassette');
    expect(cassette).toBeTruthy();
    expect(cassette.processCapabilities).toMatchObject({ create: true, createModes: ['genericCreate'], processUpdate: true });
    expect(typeof cassette.constructionHandlers.genericCreate).toBe('function');
    expect(instanceServiceResolver('organization')).toBeNull();
    expect(instanceServiceResolver('artifact')).toBeNull();
    expect(instanceServiceResolver('unknown-ghost-type')).toBeTruthy(); // fails loudly per call
  });

  it('constructs into the per-class collection with the declared shape', async () => {
    const service = instanceServiceResolver('cassette');
    const created = await service.constructionHandlers.genericCreate(
      { identity: { name: 'Panel A' }, data: { note: 'first' } },
      { userId: 'u1', organizationId: 'org-1' }
    );
    expect(inserted[0].collection).toBe('files');
    expect(inserted[0].doc).toMatchObject({
      type: 'cassette',
      typeVersion: 1,
      identity: { name: 'Panel A' },
      status: { state: { primary: 'CREATED' } },
      lineage: { organizationId: 'org-1' }
    });
    expect(created.type).toBe('cassette');
  });

  it('lists org-scoped with the type discriminator', async () => {
    const service = instanceServiceResolver('sheet-design');
    await service.processList({}, { userId: 'u1', organizationId: 'org-1' });
    expect(queries.at(-1).collection).toBe('files');
    expect(queries.at(-1).filter).toMatchObject({ type: 'sheet-design', 'lineage.organizationId': 'org-1' });
  });

  it('unknown types fail loudly on use, not on resolution', async () => {
    const service = instanceServiceResolver('ghost-panel');
    await expect(service.processList({}, { userId: 'u1', organizationId: 'org-1' }))
      .rejects.toThrow(/no declaration in the registry view/);
  });
});
