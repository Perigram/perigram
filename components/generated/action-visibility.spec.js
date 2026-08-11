import { describe, expect, it } from 'vitest';
import {
  actionAppliesToEntity,
  isGeneratedSurfaceAction,
  parentBoundCreateAppliesToEntityType,
  resolveGeneratedEntityActions,
  resolveScopedGeneratedActions
} from './action-visibility.js';

describe('generated action visibility', () => {
  it('shows status-bearing updates only on entities in the source status', () => {
    const action = {
      actionKind: 'updateEntity',
      entityType: 'cassette',
      status: { from: 'CREATED', to: 'DELETED' }
    };

    expect(actionAppliesToEntity(action, { status: { state: { primary: 'CREATED' } } }, 'cassette')).toBe(true);
    expect(actionAppliesToEntity(action, { status: { state: { primary: 'DELETED' } } }, 'cassette')).toBe(false);
    expect(actionAppliesToEntity(action, {}, 'cassette')).toBe(false);
  });

  it('does not expose create actions on entity rows', () => {
    expect(actionAppliesToEntity({ actionKind: 'createEntity', entityType: 'cassette' }, {}, 'cassette')).toBe(false);
  });

  it('shows parent-bound create actions on matching entity details', () => {
    const action = {
      actionKind: 'createEntity',
      entityType: 'cassette_design',
      parentEntityType: 'cassette',
      status: { from: 'CREATED', to: 'RECEIVED' }
    };

    expect(actionAppliesToEntity(action, { status: { state: { primary: 'CREATED' } } }, 'cassette')).toBe(true);
    expect(actionAppliesToEntity(action, { status: { state: { primary: 'DELETED' } } }, 'cassette')).toBe(false);
    expect(actionAppliesToEntity(action, { status: { state: { primary: 'CREATED' } } }, 'project')).toBe(false);
  });

  it('identifies parent-bound create actions for collection rows', () => {
    expect(parentBoundCreateAppliesToEntityType({
      actionKind: 'createEntity',
      entityType: 'cassette_design',
      parentEntityType: 'cassette'
    }, 'cassette')).toBe(true);
    expect(parentBoundCreateAppliesToEntityType({
      actionKind: 'createEntity',
      entityType: 'cassette'
    }, 'cassette')).toBe(false);
  });

  it('hides entity actions from other entity lists', () => {
    expect(actionAppliesToEntity({ actionKind: 'updateEntity', entityType: 'project' }, {}, 'cassette')).toBe(false);
  });

  it('resolves generated entity actions from region ids and user action manifest', () => {
    const entity = { status: { state: { primary: 'READY' } } };
    const actions = resolveGeneratedEntityActions({
      actionIds: ['solve', 'delete', 'missing'],
      actionManifest: [
        {
          actionId: 'solve',
          actionKind: 'runCommand',
          commandId: 'solveNesting',
          entityType: 'queue',
          status: { from: 'READY' }
        },
        {
          actionId: 'delete',
          actionKind: 'updateEntity',
          entityType: 'queue',
          status: { from: 'ARCHIVED', to: 'DELETED' }
        }
      ],
      entity,
      entityType: 'queue'
    });

    expect(actions.map(action => action.actionId)).toEqual(['solve']);
  });

  it('resolves a compiler-scoped body producer without reinterpreting its output entity', () => {
    const producer = {
      actionId: 'create-design',
      actionKind: 'createEntity',
      entityType: 'cassette_design',
      contracts: {
        inputs: [{ id: 'queue', kind: 'entity', entityType: 'queue' }],
        outputs: [{ id: 'created', kind: 'entity', entityType: 'cassette_design' }]
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
    expect(isGeneratedSurfaceAction({ actionKind: 'updateEntity' })).toBe(true);
  });
});
