import { describe, expect, it, vi } from 'vitest';

vi.mock('~/server/db/mongo', () => ({ connectDB: vi.fn() }));

import { deriveInstanceIndexes, ensureInstanceIndexes } from './indexes.js';
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
