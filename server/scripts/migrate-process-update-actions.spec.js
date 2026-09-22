import { describe, expect, it } from 'vitest';
import { migrateProcessUpdateActions, migrateStatusAction } from './migrate-process-update-actions.js';

describe('process update action migration', () => {
  it('converts a legacy status action without changing its authored contracts', () => {
    const migrated = migrateStatusAction({
      id: 'approve',
      actionKind: 'changeStatus',
      typeId: 'project',
      stateRef: 'approved',
      state: { from: 'DRAFT', to: 'APPROVED', label: 'Approve' },
      access: { grants: [{ roleId: 'approver', level: 'write' }] },
      inputPolicy: { fields: [{ id: 'note', path: 'stateMeta.note' }] },
      trigger: { mode: 'manual' }
    });

    expect(migrated).toMatchObject({
      id: 'approve',
      actionKind: 'updateEntity',
      typeId: 'project',
      stateRef: 'approved',
      state: { from: 'DRAFT', to: 'APPROVED', label: 'Approve' },
      access: {
        grants: [{ roleId: 'approver', level: 'write' }],
        stateFrom: 'DRAFT',
        stateTo: 'APPROVED'
      },
      mutation: { fields: [] },
      inputPolicy: { fields: [{ id: 'note', path: 'stateMeta.note' }] },
      trigger: { mode: 'manual' }
    });
    expect(migrated.inputs.map(input => input.id)).toEqual(['entity', 'status']);
  });

  it('leaves canonical definitions unchanged', () => {
    const data = { actions: { update: { actionKind: 'updateEntity', mutation: { fields: ['data.name'] } } } };
    expect(migrateProcessUpdateActions(data)).toEqual({ data, changed: false });
  });
});
