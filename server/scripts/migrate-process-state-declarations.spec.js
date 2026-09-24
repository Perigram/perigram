import { describe, expect, it } from 'vitest';
import {
  migrateProcessStateDeclarations,
  runProcessStateDeclarationMigration
} from './migrate-process-state-declarations.js';

function processData(overrides = {}) {
  return {
    schemaVersion: 1,
    dataflowVersion: 4,
    graphProtocol: 5,
    graph: {
      nodes: [
        { id: 'canvas-widget', type: 'ctsClass', data: { refId: 'class-widget', typeId: 'widget' } },
        { id: 'canvas-parent', type: 'ctsState', data: { refId: 'state-parent', typeId: 'widget', value: 'PRODUCTION' } },
        { id: 'canvas-child', type: 'ctsState', data: { refId: 'state-child', typeId: 'widget', value: 'cutting' } },
        { id: 'canvas-done', type: 'ctsState', data: { refId: 'state-done', typeId: 'widget', value: 'DONE' } },
        { id: 'canvas-qa', type: 'ctsState', data: { refId: 'state-qa', typeId: 'widget', value: 'OPEN' } }
      ],
      edges: [
        { id: 'declares-parent', source: 'canvas-parent', target: 'canvas-widget', role: 'type', label: 'state' },
        { id: 'nests-child', source: 'canvas-child', target: 'canvas-parent', role: 'type', label: 'nested' },
        { id: 'declares-done', source: 'canvas-done', target: 'canvas-widget', role: 'type', label: 'state' },
        { id: 'declares-qa', source: 'canvas-qa', target: 'canvas-widget', role: 'type', label: 'state' }
      ]
    },
    ctsTypes: {
      'class-widget': { id: 'class-widget', kind: 'class', typeId: 'widget', class: 'item' },
      'state-parent': { id: 'state-parent', kind: 'state', typeId: 'widget', value: 'PRODUCTION', initial: true, terminal: false },
      'state-child': { id: 'state-child', kind: 'state', typeId: 'widget', value: 'cutting', initial: false, terminal: false },
      'state-done': { id: 'state-done', kind: 'state', typeId: 'widget', value: 'DONE', initial: false, terminal: true },
      'state-qa': { id: 'state-qa', kind: 'state', typeId: 'widget', axis: 'qa', value: 'OPEN', initial: false, terminal: false }
    },
    migrations: {
      statuses: [
        { typeId: 'widget', from: 'PRODUCTION.queued', to: 'PRODUCTION.cutting' },
        { typeId: 'widget', from: 'OPEN', to: 'APPROVED', region: 'qa' }
      ]
    },
    ...overrides
  };
}

function fakeDb(documents) {
  const updates = [];
  return {
    updates,
    collection(name) {
      if (name !== 'process_definitions') throw new Error(`unexpected collection ${name}`);
      return {
        find() {
          return (async function* () {
            for (const document of documents) yield document;
          })();
        },
        async updateOne(filter, update) {
          updates.push({ name, filter, update });
          const document = documents.find(item => item._id === filter._id);
          if (document) Object.assign(document, update.$set);
          return { matchedCount: document ? 1 : 0 };
        }
      };
    }
  };
}

describe('process declaration state migration', () => {
  it('adds axis and stable semantic parent ids from the declaration graph', () => {
    const data = processData();
    const result = migrateProcessStateDeclarations(data);

    expect(result.changed).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.data.ctsTypes['state-parent']).toMatchObject({
      axis: 'main',
      parentStateId: null,
      value: 'PRODUCTION'
    });
    expect(result.data.ctsTypes['state-child']).toMatchObject({
      axis: 'main',
      parentStateId: 'state-parent',
      value: 'cutting'
    });
    expect(result.data.ctsTypes['state-done']).toMatchObject({
      axis: 'main',
      parentStateId: null
    });
    expect(result.data.ctsTypes['state-qa']).toMatchObject({
      axis: 'qa',
      parentStateId: null
    });
    expect(result.data.graph).toEqual(data.graph);
  });

  it('adds main only to old status migration rows and preserves dotted leaf paths', () => {
    const data = processData({ ctsTypes: {}, graph: { nodes: [], edges: [] } });
    const result = migrateProcessStateDeclarations(data);

    expect(result.data.migrations.statuses).toEqual([
      { typeId: 'widget', from: 'PRODUCTION.queued', to: 'PRODUCTION.cutting', region: 'main' },
      { typeId: 'widget', from: 'OPEN', to: 'APPROVED', region: 'qa' }
    ]);
  });

  it('is idempotent and does not mutate the source definition', () => {
    const data = processData();
    const before = structuredClone(data);
    const migrated = migrateProcessStateDeclarations(data);

    expect(data).toEqual(before);
    expect(migrateProcessStateDeclarations(migrated.data)).toEqual({
      data: migrated.data,
      changed: false,
      diagnostics: []
    });
  });

  it('reports an unresolved parent state instead of inventing a parent id', () => {
    const data = processData();
    data.ctsTypes['state-parent'] = undefined;
    delete data.ctsTypes['state-parent'];

    const result = migrateProcessStateDeclarations(data);

    expect(result.changed).toBe(false);
    expect(result.data).toBe(data);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'unresolved-parent-state',
        childStateId: 'state-child',
        parentNodeId: 'canvas-parent'
      })
    ]);
  });

  it('dry-runs by default, applies explicitly, and does not rewrite on a second pass', async () => {
    const documents = [
      { _id: 'process-1', states: { main: 'DRAFT' }, data: processData() },
      { _id: 'process-clean', states: { main: 'DRAFT' }, data: processData({ ctsTypes: {}, graph: { nodes: [], edges: [] } }) }
    ];
    const db = fakeDb(documents);

    const dryRun = await runProcessStateDeclarationMigration(db);
    expect(dryRun).toMatchObject({ mode: 'dry-run', scanned: 2, changed: 2, applied: 0 });
    expect(db.updates).toEqual([]);

    const applied = await runProcessStateDeclarationMigration(db, { apply: true });
    expect(applied).toMatchObject({ mode: 'apply', scanned: 2, changed: 2, applied: 2 });
    expect(db.updates).toHaveLength(2);

    const repeated = await runProcessStateDeclarationMigration(db, { apply: true });
    expect(repeated).toMatchObject({ mode: 'apply', scanned: 2, changed: 0, applied: 0 });
    expect(db.updates).toHaveLength(2);
  });
});
