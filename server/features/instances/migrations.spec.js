import { describe, expect, it, vi, beforeEach } from 'vitest';
import { transformInstanceForSteps, applyTypeMigrationSteps } from './migrations.js';

vi.mock('~/server/db/mongo', () => {
  const state = { docs: [], updates: [] };
  const cursor = {
    async *[Symbol.asyncIterator]() {
      yield* state.docs;
    }
  };
  return {
    connectDB: vi.fn(async () => ({
      collection: () => ({
        find: filter => {
          // Mirror the executor's behind-documents filter so specs assert
          // the real scan contract (finished documents carry the stamp).
          const behind = state.docs.filter(doc => doc.typeVersion !== filter.typeVersion.$ne);
          return (async function* () { yield* behind; })();
        },
        updateOne: async (filter, update) => {
          state.updates.push({ filter, update });
          return { matchedCount: 1 };
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
    const { fields, main, applied } = transformInstanceForSteps(doc, [
      { kind: 'rename-enum-value', axis: 'main', from: 'scrap', to: 'recycled' },
      { kind: 'rename-field', from: 'note', to: 'label' },
      { kind: 'retype-field', field: 'thickness', via: { op: 'mul', args: [{ op: 'var', name: 'value' }, { op: 'lit', value: 10 }] } },
      { kind: 'remove-field', field: 'keep' },
      { kind: 'add-default-field', field: 'origin', value: 'imported' }
    ]);
    expect(fields).toEqual({ label: 'a', thickness: 30, origin: 'imported' });
    expect(main).toBe('recycled');
    expect(applied).toHaveLength(5);
    // The source document is not mutated.
    expect(doc.fields).toEqual({ note: 'a', thickness: 3, keep: true });
  });

  it('is idempotent: a second pass over the transformed document applies nothing', () => {
    const steps = [{ kind: 'rename-field', from: 'note', to: 'label' }];
    const once = transformInstanceForSteps({ fields: { note: 'a' } }, steps);
    const twice = transformInstanceForSteps(once.fields, steps);
    expect(twice.applied).toEqual([]);
  });
});

describe('applyTypeMigrationSteps', () => {
  beforeEach(() => {
    __state.docs = [];
    __state.updates = [];
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
});
