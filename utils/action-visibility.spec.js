import { describe, expect, it } from 'vitest';
import {
  actionAppliesToEntity,
  isGeneratedSurfaceAction,
  parentBoundCreateAppliesToTypeId,
  resolveGeneratedEntityActions,
  resolveScopedGeneratedActions
} from '~/utils/action-visibility.js';

describe('generated action visibility', () => {
  it('accepts the projected manifest vocabulary beside the legacy kinds', () => {
    expect(actionAppliesToEntity({ actionKind: 'createInstance', typeId: 'cassette' }, {}, 'cassette')).toBe(false);
    expect(actionAppliesToEntity(
      { actionKind: 'updateInstance', typeId: 'cassette', state: { from: 'CREATED', to: 'DELETED' } },
      { states: { main: 'CREATED' } },
      'cassette'
    )).toBe(true);
    expect(parentBoundCreateAppliesToTypeId({
      actionKind: 'createInstance',
      typeId: 'cassette_design',
      parentTypeId: 'cassette'
    }, 'cassette')).toBe(true);
    expect(isGeneratedSurfaceAction({ actionKind: 'createInstance' })).toBe(true);
    expect(isGeneratedSurfaceAction({ actionKind: 'updateInstance' })).toBe(true);
    expect(isGeneratedSurfaceAction({ actionKind: 'deleteInstance' })).toBe(true);
    expect(isGeneratedSurfaceAction({ actionKind: 'link' })).toBe(true);
    expect(isGeneratedSurfaceAction({ actionKind: 'unlink' })).toBe(false);
    expect(resolveGeneratedEntityActions({
      actionIds: ['run'],
      actionManifest: [{ id: 'run', actionKind: 'runCommand', typeId: 'queue' }],
      entity: {},
      typeId: 'queue'
    })).toHaveLength(1);
  });

  it('shows status-bearing updates only on entities in the source status', () => {
    const action = {
      actionKind: 'updateInstance',
      typeId: 'cassette',
      state: { from: 'CREATED', to: 'DELETED' }
    };

    expect(actionAppliesToEntity(action, { states: { main: 'CREATED' } }, 'cassette')).toBe(true);
    expect(actionAppliesToEntity(action, { states: { main: 'DELETED' } }, 'cassette')).toBe(false);
    expect(actionAppliesToEntity(action, {}, 'cassette')).toBe(false);
  });

  it('hides no-op status actions already in the target status', () => {
    const unscoped = {
      actionKind: 'updateInstance',
      typeId: 'cassette',
      state: { to: 'DELETED' }
    };
    expect(actionAppliesToEntity(unscoped, { state: 'DELETED' }, 'cassette')).toBe(false);
    expect(actionAppliesToEntity(unscoped, { state: 'CREATED' }, 'cassette')).toBe(true);

    const scoped = {
      actionKind: 'updateInstance',
      typeId: 'cassette',
      state: { from: 'CREATED', to: 'DELETED' }
    };
    expect(actionAppliesToEntity(scoped, { state: 'DELETED' }, 'cassette')).toBe(false);

    const inState = {
      actionKind: 'updateInstance',
      typeId: 'cassette',
      state: { from: 'DELETED', to: 'DELETED' }
    };
    expect(actionAppliesToEntity(inState, { state: 'DELETED' }, 'cassette')).toBe(true);

    const plainUpdate = { actionKind: 'updateInstance', typeId: 'cassette' };
    expect(actionAppliesToEntity(plainUpdate, { state: 'DELETED' }, 'cassette')).toBe(true);
  });

  it('resolves the primary status from the flat wire state and legacy shapes', () => {
    const action = {
      actionKind: 'updateInstance',
      typeId: 'cassette',
      state: { from: 'CREATED', to: 'DELETED' }
    };
    // Flat wire state (SPEC §7) is the production shape.
    expect(actionAppliesToEntity(action, { state: 'CREATED' }, 'cassette')).toBe(true);
    expect(actionAppliesToEntity(action, { state: 'DELETED' }, 'cassette')).toBe(false);
    // Older axis-map shape still resolves.
    expect(actionAppliesToEntity(action, { states: { main: 'CREATED' } }, 'cassette')).toBe(true);
    // Legacy status block still resolves.
    expect(actionAppliesToEntity(action, { status: { state: { primary: 'CREATED' } } }, 'cassette')).toBe(true);
  });

  it('does not expose create actions on entity rows', () => {
    expect(actionAppliesToEntity({ actionKind: 'createInstance', typeId: 'cassette' }, {}, 'cassette')).toBe(false);
  });

  it('shows parent-bound create actions on matching entity details', () => {
    const action = {
      actionKind: 'createInstance',
      typeId: 'cassette_design',
      parentTypeId: 'cassette',
      state: { from: 'CREATED', to: 'RECEIVED' }
    };

    expect(actionAppliesToEntity(action, { states: { main: 'CREATED' } }, 'cassette')).toBe(true);
    expect(actionAppliesToEntity(action, { states: { main: 'DELETED' } }, 'cassette')).toBe(false);
    expect(actionAppliesToEntity(action, { states: { main: 'CREATED' } }, 'project')).toBe(false);
  });

  it('identifies parent-bound create actions for collection rows', () => {
    expect(parentBoundCreateAppliesToTypeId({
      actionKind: 'createInstance',
      typeId: 'cassette_design',
      parentTypeId: 'cassette'
    }, 'cassette')).toBe(true);
    expect(parentBoundCreateAppliesToTypeId({
      actionKind: 'createInstance',
      typeId: 'cassette'
    }, 'cassette')).toBe(false);
  });

  it('hides entity actions from other entity lists', () => {
    expect(actionAppliesToEntity({ actionKind: 'updateInstance', typeId: 'project' }, {}, 'cassette')).toBe(false);
  });

  it('resolves generated entity actions from region ids and user action manifest', () => {
    const entity = { states: { main: 'READY' } };
    const actions = resolveGeneratedEntityActions({
      actionIds: ['solve', 'delete', 'missing'],
      actionManifest: [
        {
          id: 'solve',
          actionKind: 'runCommand',
          commandId: 'solveNesting',
          typeId: 'queue',
          state: { from: 'READY' }
        },
        {
          id: 'delete',
          actionKind: 'updateInstance',
          typeId: 'queue',
          state: { from: 'ARCHIVED', to: 'DELETED' }
        }
      ],
      entity,
      typeId: 'queue'
    });

    expect(actions.map(action => action.id)).toEqual(['solve']);
  });

  it('resolves a compiler-scoped body producer without reinterpreting its output entity', () => {
    const producer = {
      id: 'create-design',
      actionKind: 'createInstance',
      typeId: 'cassette_design',
      contracts: {
        inputs: [{ id: 'queue', kind: 'entity', typeId: 'queue' }],
        outputs: [{ id: 'created', kind: 'entity', typeId: 'cassette_design' }]
      }
    };

    expect(resolveScopedGeneratedActions({
      actionIds: ['create-design'],
      actionManifest: [producer]
    })).toEqual([producer]);
    expect(resolveScopedGeneratedActions({
      actionIds: ['create-design'],
      actionManifest: []
    })).toEqual([]);
  });

  it('keeps only canonical process actions in generic action surfaces', () => {
    expect(isGeneratedSurfaceAction({ actionKind: 'obsolete' })).toBe(false);
    expect(isGeneratedSurfaceAction({ actionKind: 'runCommand' })).toBe(true);
    expect(isGeneratedSurfaceAction({ actionKind: 'updateInstance' })).toBe(true);
    expect(isGeneratedSurfaceAction({ actionKind: 'updateInstance' })).toBe(true);
    expect(isGeneratedSurfaceAction({ actionKind: 'deleteInstance' })).toBe(true);
    expect(isGeneratedSurfaceAction({ actionKind: 'deleteInstance', trigger: { mode: 'automatic' } })).toBe(false);
  });
});
