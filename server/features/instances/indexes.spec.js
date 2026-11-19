import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

vi.mock('~/server/db/mongo', () => ({ connectDB: vi.fn() }));

import { deriveInstanceIndexes, ensureInstanceIndexes, pruneInstanceUniqueIndexes } from './indexes.js';
import { connectDB } from '~/server/db/mongo';

const view = new Map([
  ['project', {
    id: 'project',
    class: 'group',
    edges: { children: { members: { types: ['queue', 'facade'], onRemove: 'restrict' } }, relations: { linked: { types: ['facade'], cardinality: 'many' } } }
  }],
  ['queue', {
    id: 'queue',
    class: 'process',
    edges: {},
    states: {
      main: { initial: 'draft', states: { draft: {} } },
      quality: { initial: 'unchecked', states: { unchecked: {} } }
    }
  }],
  ['facade', { id: 'facade', class: 'item', edges: {} }],
  ['cut-plan', { id: 'cut-plan', class: 'file', edges: {} }]
]);

function keySet(indexes, collection) {
  return indexes.filter(index => index.collection === collection).map(index => JSON.stringify(index.keys));
}

describe('derived instance indexes (SPEC §13)', () => {
  it('derives the base set for every class collection in use', () => {
    const indexes = deriveInstanceIndexes(view);
    for (const collection of ['files', 'items', 'groups', 'processes']) {
      expect(keySet(indexes, collection)).toContain(JSON.stringify({ type: 1, organizationId: 1, createdAt: -1 }));
      expect(keySet(indexes, collection)).toContain(JSON.stringify({ type: 1, organizationId: 1, 'states.main': 1 }));
    }
    expect(keySet(indexes, 'files')).toHaveLength(2);
  });

  it('indexes every declared state axis used by a collection', () => {
    const indexes = deriveInstanceIndexes(view);
    expect(keySet(indexes, 'processes')).toContain(JSON.stringify({ type: 1, organizationId: 1, 'states.main': 1 }));
    expect(keySet(indexes, 'processes')).toContain(JSON.stringify({ type: 1, organizationId: 1, 'states.quality': 1 }));
    expect(keySet(indexes, 'files')).not.toContain(JSON.stringify({ type: 1, organizationId: 1, 'states.quality': 1 }));
  });

  it('indexes children edges on each child type\'s class collection and relations on the owner\'s', () => {
    const indexes = deriveInstanceIndexes(view);
    // members edge: queue (process) and facade (item) both store lineage.members
    expect(keySet(indexes, 'processes')).toContain(JSON.stringify({ type: 1, organizationId: 1, 'lineage.members': 1 }));
    expect(keySet(indexes, 'items')).toContain(JSON.stringify({ type: 1, organizationId: 1, 'lineage.members': 1 }));
    // relations edge on the owner (group collection)
    expect(keySet(indexes, 'groups')).toContain(JSON.stringify({ type: 1, organizationId: 1, 'relations.linked': 1 }));
  });

  it('keys the children index by the edge\'s declared lineageKey, not its map key', () => {
    // Registry-normalized views stamp lineageKey (SPEC §6); the stored
    // key is the declaration's, never the authoring map key.
    const stamped = new Map(view);
    stamped.set('project', {
      ...view.get('project'),
      edges: { children: { members: { types: ['queue'], onRemove: 'restrict', lineageKey: 'projectId' } } }
    });
    const indexes = deriveInstanceIndexes(stamped);
    expect(keySet(indexes, 'processes')).toContain(JSON.stringify({ type: 1, organizationId: 1, 'lineage.projectId': 1 }));
    expect(keySet(indexes, 'processes')).not.toContain(JSON.stringify({ type: 1, organizationId: 1, 'lineage.members': 1 }));
  });

  it('derives exact scalar uniqueness indexes with global and organization scopes', () => {
    const uniqueView = new Map([
      ['customer', {
        id: 'customer',
        class: 'item',
        scope: 'system',
        fields: { code: { base: 'string' }, profile: { base: 'record', fields: { email: { base: 'string' } } } },
        constraints: [{ id: 'unique-email', kind: 'unique', scope: 'global', field: 'profile.email', equality: 'exact', nulls: 'ignore' }],
        edges: {}
      }],
      ['org-customer', {
        id: 'org-customer',
        class: 'item',
        scope: 'org',
        organizationId: 'org-1',
        fields: { code: { base: 'string' } },
        constraints: [{ id: 'unique-code', kind: 'unique', scope: 'organization', field: 'code', equality: 'exact', nulls: 'ignore' }],
        edges: {}
      }]
    ]);
    const indexes = deriveInstanceIndexes(uniqueView, { organizationId: 'org-1' });
    const global = indexes.find(index => index.options?.name?.startsWith('cts_u_g_'));
    const scoped = indexes.find(index => index.options?.name?.startsWith('cts_u_o_'));
    expect(global).toMatchObject({
      collection: 'items',
      keys: { type: 1, 'fields.profile.email': 1 },
      options: {
        unique: true,
        partialFilterExpression: { type: 'customer', 'fields.profile.email': { $type: 'string' } },
        collation: { locale: 'simple' }
      }
    });
    expect(scoped).toMatchObject({
      collection: 'items',
      keys: { type: 1, organizationId: 1, 'fields.code': 1 },
      options: {
        unique: true,
        partialFilterExpression: { type: 'org-customer', 'fields.code': { $type: 'string' }, organizationId: 'org-1' }
      }
    });
  });

  it('prunes only stale unique indexes for the selected scope', async () => {
    const dropIndex = vi.fn();
    const organizationScope = createHash('sha256').update('org-1').digest('hex').slice(0, 12);
    const organizationIndex = `cts_u_o_${organizationScope}_stale`;
    const listIndexes = vi.fn(() => ({ toArray: async () => [
      { name: '_id_' },
      { name: organizationIndex },
      { name: 'cts_u_g_stale' }
    ] }));
    const emptyCollection = {
      listIndexes: () => ({ toArray: async () => [] }),
      dropIndex: vi.fn()
    };
    (await connectDB).mockResolvedValue({
      collection: name => name === 'items' ? { listIndexes, dropIndex } : emptyCollection
    });
    const dropped = await pruneInstanceUniqueIndexes(view, { organizationId: 'org-1' });
    expect(dropped).toHaveLength(2);
    expect(dropIndex).toHaveBeenCalledWith(organizationIndex);
    expect(dropIndex).toHaveBeenCalledWith('cts_u_g_stale');
  });

  it('tolerates collections that do not exist yet while pruning', async () => {
    const missing = {
      listIndexes: () => ({ toArray: async () => { throw Object.assign(new Error('ns not found'), { code: 26 }); } }),
      dropIndex: vi.fn()
    };
    const codeNameMissing = {
      listIndexes: () => ({ toArray: async () => { throw Object.assign(new Error('ns not found'), { codeName: 'NamespaceNotFound' }); } }),
      dropIndex: vi.fn()
    };
    (await connectDB).mockResolvedValue({
      collection: name => name === 'items' ? missing : codeNameMissing
    });
    const dropped = await pruneInstanceUniqueIndexes(view, { organizationId: 'org-1' });
    expect(dropped).toEqual([]);
    expect(missing.dropIndex).not.toHaveBeenCalled();
    expect(codeNameMissing.dropIndex).not.toHaveBeenCalled();
  });

  it('applies every definition idempotently through createIndex', async () => {
    const createIndex = vi.fn();
    (await connectDB).mockResolvedValue({ collection: () => ({ createIndex }) });
    const definitions = await ensureInstanceIndexes(view);
    expect(definitions.length).toBeGreaterThan(0);
    expect(createIndex).toHaveBeenCalledTimes(definitions.length);
    for (const args of createIndex.mock.calls) {
      expect(args[1]).toEqual({ background: true });
    }
  });
});
