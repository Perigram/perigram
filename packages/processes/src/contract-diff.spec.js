import { describe, expect, it } from 'vitest';
import { diffProcessContracts, hasProcessContractChanges } from './contract-diff.js';

function producer(producerOutputId, entityType, workflow, fieldPolicy = { read: [], write: [], private: [], relations: [] }) {
  return { producerOutputId, entityType, workflow, fieldPolicy };
}

function workflow(states = [], transitions = [], initial = '') {
  return {
    primaryRegion: 'main',
    regions: {
      main: {
        initial,
        states: Object.fromEntries(states.map(state => [state, {}])),
        transitions: transitions.map(([from, to]) => ({ from, to }))
      }
    }
  };
}

function contract(producers = [], actions = {}, screens = {}, roles = {}) {
  return {
    producerOutputs: Object.fromEntries(producers.map(item => [item.producerOutputId, item])),
    actions,
    screens,
    roles
  };
}

describe('semantic process contract diff', () => {
  it('reports no changes for identical contracts', () => {
    const previous = contract(
      [producer('create_queue:entity', 'queue', workflow(['CREATED', 'ACTIVE'], [['CREATED', 'ACTIVE']], 'CREATED'))],
      { rename: { actionKind: 'updateEntity', entityType: 'queue', access: { level: 'write' } } }
    );
    const diff = diffProcessContracts(previous, structuredClone(previous));
    expect(hasProcessContractChanges(diff)).toBe(false);
    expect(diff.removedEntityStatuses).toEqual([]);
  });

  it('diffs added, removed, and changed actions with the changed fields', () => {
    const previous = contract([], {
      keep: { actionKind: 'updateEntity', entityType: 'queue', access: { level: 'write' } },
      drop: { actionKind: 'deleteEntity', entityType: 'queue', access: { level: 'admin' } }
    });
    const next = contract([], {
      keep: { actionKind: 'updateEntity', entityType: 'queue', access: { level: 'admin' } },
      added: { actionKind: 'createEntity', entityType: 'queue' }
    });
    const diff = diffProcessContracts(previous, next);
    expect(diff.actions.added).toEqual(['added']);
    expect(diff.actions.removed).toEqual(['drop']);
    expect(diff.actions.changed).toEqual([{ id: 'keep', changes: ['access.level'] }]);
    expect(hasProcessContractChanges(diff)).toBe(true);
  });

  it('diffs workflow states, transitions, and entry per producer', () => {
    const previous = contract([
      producer('create_queue:entity', 'queue', workflow(['CREATED', 'ACTIVE', 'RETIRED'], [['CREATED', 'ACTIVE'], ['ACTIVE', 'RETIRED']], 'CREATED'))
    ]);
    const next = contract([
      producer('create_queue:entity', 'queue', workflow(['CREATED', 'ACTIVE'], [['CREATED', 'ACTIVE']], 'ACTIVE'))
    ]);
    const diff = diffProcessContracts(previous, next);
    expect(diff.workflows.changed).toEqual([{
      producerOutputId: 'create_queue:entity',
      entityType: 'queue',
      addedStates: [],
      removedStates: ['main:RETIRED'],
      addedTransitions: [],
      removedTransitions: ['ACTIVE->RETIRED'],
      entryChanged: true
    }]);
  });

  it('reports removed entity statuses from the union of same-type producers', () => {
    const previous = contract([
      producer('create_a:entity', 'queue', workflow(['CREATED', 'ACTIVE'])),
      producer('import_b:entity', 'queue', workflow(['IMPORTED']))
    ]);
    const next = contract([
      producer('create_a:entity', 'queue', workflow(['CREATED'])),
      producer('import_b:entity', 'queue', workflow(['IMPORTED']))
    ]);
    const diff = diffProcessContracts(previous, next);
    expect(diff.removedEntityStatuses).toEqual([{ entityType: 'queue', statuses: ['ACTIVE'] }]);
  });

  it('keeps a status that survives on any same-type producer', () => {
    const previous = contract([producer('create_a:entity', 'queue', workflow(['CREATED', 'ACTIVE']))]);
    const next = contract([
      producer('create_a:entity', 'queue', workflow(['CREATED'])),
      producer('import_b:entity', 'queue', workflow(['ACTIVE']))
    ]);
    const diff = diffProcessContracts(previous, next);
    expect(diff.removedEntityStatuses).toEqual([]);
  });

  it('diffs field policies per producer section', () => {
    const previous = contract([
      producer('create_queue:entity', 'queue', workflow(['CREATED']), { read: ['identity.*'], write: ['identity.name'], private: [], relations: ['parts'] })
    ]);
    const next = contract([
      producer('create_queue:entity', 'queue', workflow(['CREATED']), { read: ['identity.*', 'data.*'], write: [], private: ['data.cost'], relations: [] })
    ]);
    const diff = diffProcessContracts(previous, next);
    expect(diff.fieldPolicies.changed).toEqual([{
      producerOutputId: 'create_queue:entity',
      entityType: 'queue',
      added: { read: ['data.*'], private: ['data.cost'] },
      removed: { write: ['identity.name'], relations: ['parts'] }
    }]);
  });

  it('diffs CRUD capabilities per entity type', () => {
    const previous = contract([], {
      create: { actionKind: 'createEntity', entityType: 'queue' },
      remove: { actionKind: 'deleteEntity', entityType: 'queue' }
    });
    const next = contract([], {
      create: { actionKind: 'createEntity', entityType: 'queue' },
      status: { actionKind: 'changeStatus', entityType: 'queue' },
      project: { actionKind: 'createEntity', entityType: 'project' }
    });
    const diff = diffProcessContracts(previous, next);
    expect(diff.capabilities.changed).toContainEqual({ entityType: 'queue', added: ['changeStatus'], removed: ['deleteEntity'] });
    expect(diff.capabilities.changed).toContainEqual({ entityType: 'project', added: ['createEntity'], removed: [] });
  });

  it('diffs screens and roles by record identity', () => {
    const previous = contract([], {}, {
      kept: { route: '/queue', template: 'entityList' },
      dropped: { route: '/old', template: 'entityList' }
    }, { operator: { grants: [{ feature: 'queues', level: 'write' }], actions: [] } });
    const next = contract([], {}, {
      kept: { route: '/queue', template: 'entityDetail' },
      added: { route: '/new', template: 'entityList' }
    }, { operator: { grants: [], actions: [] } });
    const diff = diffProcessContracts(previous, next);
    expect(diff.screens.added).toEqual(['added']);
    expect(diff.screens.removed).toEqual(['dropped']);
    expect(diff.screens.changed).toEqual([{ id: 'kept', changes: ['template'] }]);
    expect(diff.roles.changed).toEqual([{ id: 'operator', changes: ['grants'] }]);
  });

  it('reports producer additions and removals', () => {
    const previous = contract([producer('create_a:entity', 'queue', workflow(['CREATED']))]);
    const next = contract([producer('import_b:entity', 'queue', workflow(['CREATED']))]);
    const diff = diffProcessContracts(previous, next);
    expect(diff.workflows.removedProducers).toEqual(['create_a:entity']);
    expect(diff.workflows.addedProducers).toEqual(['import_b:entity']);
    expect(diff.fieldPolicies.removedProducers).toEqual(['create_a:entity']);
    expect(diff.fieldPolicies.addedProducers).toEqual(['import_b:entity']);
  });
});
