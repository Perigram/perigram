import { describe, expect, it } from 'vitest';
import {
  migrateCtsTypeStateTree,
  runCtsStateTreeMigration
} from './migrate-cts-state-trees.js';

function flatTypeDocument(overrides = {}) {
  return {
    _id: 'type-1',
    id: 'widget',
    scope: 'org',
    organizationId: 'org-1',
    states: {
      main: {
        initial: 'PRODUCTION.queued',
        values: ['PRODUCTION.queued', 'PRODUCTION.cutting', 'DONE'],
        terminal: ['DONE'],
        render: {
          'PRODUCTION.queued': { label: 'Queued' },
          'PRODUCTION.cutting': { label: 'Cutting', icon: 'pi pi-spinner', severity: 'info' },
          DONE: { label: 'Done', severity: 'success' }
        }
      },
      qa: {
        initial: 'OPEN',
        values: ['OPEN', 'APPROVED'],
        terminal: ['APPROVED'],
        render: {
          OPEN: { label: 'Open' },
          APPROVED: { label: 'Approved', severity: 'success' }
        }
      }
    },
    transitions: [
      { axis: 'main', from: 'PRODUCTION.queued', to: 'PRODUCTION.cutting' },
      { axis: 'qa', from: 'OPEN', to: 'APPROVED', intent: 'approve' }
    ],
    ...overrides
  };
}

function fakeDb(documents) {
  const updates = [];
  return {
    updates,
    collection(name) {
      if (name !== 'cts_types') throw new Error(`unexpected collection ${name}`);
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

describe('CTS persisted state-tree migration', () => {
  it('converts every unambiguous flat axis and preserves dotted leaf paths and transitions', () => {
    const document = flatTypeDocument();
    const result = migrateCtsTypeStateTree(document);

    expect(result.changed).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.data.states.main).toEqual({
      initial: 'PRODUCTION.queued',
      states: {
        PRODUCTION: {
          initial: 'queued',
          states: {
            queued: { policy: { label: 'Queued' } },
            cutting: { policy: { label: 'Cutting', icon: 'pi pi-spinner', severity: 'info' } }
          }
        },
        DONE: { terminal: true, policy: { label: 'Done', severity: 'success' } }
      }
    });
    expect(result.data.states.qa).toEqual({
      initial: 'OPEN',
      states: {
        OPEN: { policy: { label: 'Open' } },
        APPROVED: { terminal: true, policy: { label: 'Approved', severity: 'success' } }
      }
    });
    expect(result.data.transitions).toEqual(document.transitions);
  });

  it('is idempotent for converted and already-recursive declarations', () => {
    const migrated = migrateCtsTypeStateTree(flatTypeDocument()).data;
    expect(migrateCtsTypeStateTree(migrated)).toEqual({ data: migrated, changed: false, diagnostics: [] });

    const canonical = {
      id: 'canonical',
      states: {
        main: {
          initial: 'OPENING.queued',
          states: {
            OPENING: {
              initial: 'queued',
              states: { queued: { policy: { label: 'Queued' } } }
            }
          }
        }
      }
    };
    expect(migrateCtsTypeStateTree(canonical)).toEqual({ data: canonical, changed: false, diagnostics: [] });
  });

  it('reports an ambiguous secondary axis and leaves the whole declaration untouched', () => {
    const document = flatTypeDocument();
    document.states.qa.values = [{ name: 'OPEN' }, { name: 'APPROVED' }];

    const result = migrateCtsTypeStateTree(document);

    expect(result).toEqual({
      data: document,
      changed: false,
      diagnostics: [expect.objectContaining({
        code: 'invalid-secondary-axis-values',
        typeId: 'widget',
        axis: 'qa'
      })]
    });
    expect(result.data.states.main.values).toEqual(['PRODUCTION.queued', 'PRODUCTION.cutting', 'DONE']);
  });

  it('dry-runs by default, applies explicitly, and is idempotent against the persisted result', async () => {
    const documents = [flatTypeDocument()];
    const db = fakeDb(documents);

    const dryRun = await runCtsStateTreeMigration(db);
    expect(dryRun).toMatchObject({ mode: 'dry-run', scanned: 1, changed: 1, applied: 0 });
    expect(db.updates).toEqual([]);

    const applied = await runCtsStateTreeMigration(db, { apply: true });
    expect(applied).toMatchObject({ mode: 'apply', scanned: 1, changed: 1, applied: 1 });
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0].update.$set.states.main.states.PRODUCTION.states.cutting).toEqual({
      policy: { label: 'Cutting', icon: 'pi pi-spinner', severity: 'info' }
    });

    const repeated = await runCtsStateTreeMigration(db, { apply: true });
    expect(repeated).toMatchObject({ mode: 'apply', scanned: 1, changed: 0, applied: 0 });
    expect(db.updates).toHaveLength(1);
  });
});
