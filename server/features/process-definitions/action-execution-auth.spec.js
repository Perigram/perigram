import { describe, expect, it } from 'vitest';
import { createActionExecutionAuthHelpers } from './action-execution-auth.js';

describe('process action execution authorization', () => {
  const helpers = createActionExecutionAuthHelpers({
    getDomain: () => ({
      entities: [
        { type: 'work_item', feature: 'work-items' },
        { type: 'legacy_asset', collection: 'assets' }
      ],
      fieldAccess: {}
    })
  });

  it('requires the action to be present in the authorized assignment manifest', () => {
    expect(() => helpers.assertCompiledActionAvailable('approve', {
      roleAssignments: { actions: [{ id: 'approve' }] }
    })).not.toThrow();

    expect(() => helpers.assertCompiledActionAvailable('delete', {
      roleAssignments: { actions: [{ actionId: 'approve' }] }
    })).toThrow(/not available/);
  });

  it('resolves action types and maps them to their owning permission feature', () => {
    expect(helpers.resolveActionTypeId({ typeId: 'work_item' })).toBe('work_item');
    expect(helpers.resolveInstanceFeature('work_item')).toBe('work-items');
    expect(helpers.resolveInstanceFeature('legacy_asset')).toBe('assets');
    expect(helpers.resolveInstanceFeature('unknown_type')).toBe('unknown_type');
  });

  it('derives mutation grants from the action kind without widening unrelated permissions', () => {
    const result = helpers.createActionExecutionAuth({
      effectivePermissions: { existing: [{ level: 'read', actions: { view: true } }] }
    }, {
      id: 'update-work-item',
      typeId: 'work_item',
      actionKind: 'updateEntity',
      access: { level: 'write' }
    });

    expect(result.effectivePermissions).toEqual({
      existing: [{ level: 'read', actions: { view: true } }],
      'work-items': [{ level: 'write', actions: { update: true, edit: true } }]
    });
  });
});
