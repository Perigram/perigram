import { describe, expect, it } from 'vitest';
import { actionAppliesToEntity } from './action-visibility.js';

describe('generated action visibility', () => {
  it('shows status actions only on entities in the source status', () => {
    const action = {
      actionKind: 'changeStatus',
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

  it('hides entity actions from other entity lists', () => {
    expect(actionAppliesToEntity({ actionKind: 'updateEntity', entityType: 'project' }, {}, 'cassette')).toBe(false);
  });
});
