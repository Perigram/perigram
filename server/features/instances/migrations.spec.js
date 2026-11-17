import { describe, expect, it, vi, beforeEach } from 'vitest';
import { transformInstanceForSteps, applyTypeMigrationSteps } from './migrations.js';

vi.mock('~/server/db/mongo', () => {
  const state = { docs: [], updates: [], matchedCount: 1 };
  const cursor = {
    async *[Symbol.asyncIterator]() {
      yield* state.docs;
    }
  };
  return {
    connectDB: vi.fn(async () => ({
      collection: () => ({
        find: filter => {
          // Mirror the executor's scan contracts so specs assert the real
          // filters: the stamped pass scans behind documents; the
          // remove-edge detach pass scans foreign children still carrying
          // the removed lineage key.
          const behind = doc => !filter.typeVersion || doc.typeVersion !== filter.typeVersion.$ne;
          const carrying = doc => {
            const [key] = Object.keys(filter).filter(candidate => candidate.startsWith('lineage.'));
            return !key || Object.hasOwn(doc.lineage || {}, key.slice('lineage.'.length));
          };
          const typed = doc => !filter.type || doc.type === filter.type;
          return (async function* () { yield* state.docs.filter(doc => behind(doc) && carrying(doc) && typed(doc)); })();
        },
        updateOne: async (filter, update) => {
          state.updates.push({ filter, update });
          return { matchedCount: state.matchedCount, modifiedCount: state.matchedCount };
        }
      })
    })),
    __state: state
  };
});

vi.mock('../instance-events/service.js', () => ({
  publishEntityChanged: vi.fn(async () => null)
}));

const { __state } = await import('~/server/db/mongo');

describe('transformInstanceForSteps', () => {
  it('applies rename, default, remove, and retype steps in one pass', () => {
    const doc = {
      fields: { note: 'a', thickness: 3, keep: true },
      states: { main: 'scrap' }
    };
    const { fields, stateChanges, applied } = transformInstanceForSteps(doc, [
      { kind: 'rename-enum-value', axis: 'main', from: 'scrap', to: 'recycled' },
      { kind: 'rename-field', from: 'note', to: 'label' },
      { kind: 'retype-field', field: 'thickness', via: { op: 'mul', args: [{ op: 'var', name: 'value' }, { op: 'lit', value: 10 }] } },
      { kind: 'remove-field', field: 'keep' },
      { kind: 'add-default-field', field: 'origin', value: 'imported' }
    ]);
    expect(fields).toEqual({ label: 'a', thickness: 30, origin: 'imported' });
    expect(stateChanges).toEqual({ main: 'recycled' });
    expect(applied).toHaveLength(5);
    // The source document is not mutated.
    expect(doc.fields).toEqual({ note: 'a', thickness: 3, keep: true });
  });

  it('is idempotent: a second pass over the transformed document applies nothing', () => {
    const steps = [{ kind: 'rename-field', from: 'note', to: 'label' }];
    const once = transformInstanceForSteps({ fields: { note: 'a' } }, steps);
    const twice = transformInstanceForSteps({ fields: once.fields }, steps);
    expect(twice.fields).toEqual({ label: 'a' });
    expect(twice.applied).toEqual([]);
  });

  it('refuses to overwrite a pre-existing field during rename', () => {
    expect(() => transformInstanceForSteps({
      fields: { legacyName: 'old', name: 'new' }
    }, [{ kind: 'rename-field', from: 'legacyName', to: 'name' }]))
      .toThrow(/target field already exists/);
  });

  it('a remove-edge step detaches only the removed lineage key', () => {
    const doc = { fields: {}, lineage: { assemblyId: 'p-1', projectId: 'p-2' } };
    const { lineage, applied } = transformInstanceForSteps(doc, [
      { kind: 'remove-edge', edge: 'children.parts', lineageKey: 'assemblyId', types: ['assembly'] }
    ]);
    expect(lineage).toEqual({ projectId: 'p-2' });
    expect(applied).toEqual(['remove-edge']);
    // The source document is not mutated; a second pass applies nothing.
    expect(doc.lineage).toEqual({ assemblyId: 'p-1', projectId: 'p-2' });
    expect(transformInstanceForSteps({ ...doc, lineage }, [
      { kind: 'remove-edge', edge: 'children.parts', lineageKey: 'assemblyId', types: ['assembly'] }
    ]).applied).toEqual([]);
  });
});

describe('applyTypeMigrationSteps', () => {
  beforeEach(() => {
    __state.docs = [];
    __state.updates = [];
    __state.matchedCount = 1;
  });

  it('rewrites behind documents, stamps the version, and publishes invalidations', async () => {
    __state.docs = [
      { _id: 'd-1', type: 'gadget', typeVersion: 3, states: { main: 'scrap' }, fields: { note: 'a' } },
      { _id: 'd-2', type: 'gadget', typeVersion: 4, states: { main: 'ready' }, fields: {} }
    ];
    const summary = await applyTypeMigrationSteps({
      declaration: { id: 'gadget', class: 'file' },
      organizationId: 'org-1',
      steps: [{ kind: 'rename-enum-value', axis: 'main', from: 'scrap', to: 'recycled' }],
      toVersion: 4,
      actor: 'admin'
    });
    expect(summary.counts).toEqual({ 'rename-enum-value': 1 });
    expect(summary.failures).toEqual([]);
    expect(__state.updates).toHaveLength(1);
    expect(__state.updates[0].update.$set).toMatchObject({ typeVersion: 4, 'states.main': 'recycled' });
    const { publishEntityChanged } = await import('../instance-events/service.js');
    expect(publishEntityChanged).toHaveBeenCalledWith(
      { userId: 'admin', organizationId: 'org-1' },
      { type: 'gadget', id: 'd-1', change: 'updated', reason: 'type-migration' }
    );
  });

  it('records per-document failures without aborting the scan', async () => {
    __state.docs = [
      { _id: 'd-1', type: 'gadget', typeVersion: 3, fields: { thickness: 3 } },
      { _id: 'd-2', type: 'gadget', typeVersion: 3, fields: {} }
    ];
    const summary = await applyTypeMigrationSteps({
      declaration: { id: 'gadget', class: 'file' },
      organizationId: 'org-1',
      steps: [
        { kind: 'retype-field', field: 'thickness', via: { op: 'nope' } },
        { kind: 'add-default-field', field: 'origin', value: 'x' }
      ],
      toVersion: 4
    });
    expect(summary.failures.map(failure => failure.id)).toEqual(['d-1']);
    expect(summary.counts).toEqual({ 'add-default-field': 1 });
  });

  it('does not publish an invalidation when the migration update matched no instance', async () => {
    __state.docs = [
      { _id: 'd-1', type: 'gadget', typeVersion: 3, fields: { note: 'a' } }
    ];
    __state.matchedCount = 0;
    const summary = await applyTypeMigrationSteps({
      declaration: { id: 'gadget', class: 'file' },
      organizationId: 'org-1',
      steps: [{ kind: 'rename-field', from: 'note', to: 'label' }],
      toVersion: 4
    });
    const { publishEntityChanged } = await import('../instance-events/service.js');
    expect(summary.failures).toMatchObject([
      { id: 'd-1', error: expect.stringMatching(/disappeared or changed/) }
    ]);
    expect(summary.counts).toEqual({});
    expect(publishEntityChanged).not.toHaveBeenCalled();
  });

  it('remove-edge detaches foreign children without the declaring type version stamp', async () => {
    __state.docs = [
      { _id: 'a-1', type: 'assembly', typeVersion: 5, fields: {}, lineage: { assemblyId: 'a-0' } },
      { _id: 'm-1', type: 'material', typeVersion: 2, fields: {}, lineage: { assemblyId: 'a-1' } },
      { _id: 'm-2', type: 'material', typeVersion: 2, fields: {}, lineage: {} }
    ];
    const summary = await applyTypeMigrationSteps({
      declaration: { id: 'assembly', class: 'item' },
      organizationId: 'org-1',
      steps: [{ kind: 'remove-edge', edge: 'children.parts', lineageKey: 'assemblyId', types: ['assembly', 'material'] }],
      toVersion: 6,
      collectionForType: typeId => (typeId === 'material' ? 'materials' : 'items')
    });
    // The self-type document rides the stamped pass with its lineage
    // rewritten; the foreign child is unset in place and keeps typeVersion.
    expect(summary.counts).toEqual({ 'remove-edge': 2 });
    const stamped = __state.updates.find(update => update.update.$set?.typeVersion === 6);
    expect(stamped.update.$set.lineage).toEqual({});
    const detached = __state.updates.find(update => update.update.$unset);
    expect(detached.update.$unset).toEqual({ 'lineage.assemblyId': '' });
    expect(detached.update.$set?.typeVersion).toBeUndefined();
  });
});
