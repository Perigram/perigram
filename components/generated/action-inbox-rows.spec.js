import { describe, expect, it } from 'vitest';
import { deriveInboxRows } from './action-inbox-rows.js';

const actions = {
  approve: { id: 'approve', actionKind: 'updateInstance', typeId: 'request', state: { from: 'submitted', to: 'approved' } },
  reject: { id: 'reject', actionKind: 'updateInstance', typeId: 'request', state: { from: 'submitted', to: 'rejected' } }
};
const items = [
  { typeId: 'request', instanceId: 'r-1', actionIds: ['approve', 'reject'] },
  { typeId: 'request', instanceId: 'r-2', actionIds: ['approve'] },
  { typeId: 'request', instanceId: 'r-gone', actionIds: ['approve'] }
];
const dtos = {
  'r-1': { _id: 'r-1', type: 'request', state: 'submitted' },
  'r-2': { _id: 'r-2', type: 'request', state: 'approved' }
};
const dtoFor = (_typeId, id) => dtos[id] || null;

describe('deriveInboxRows', () => {
  it('keeps pooled instances whose live state still admits an action, merging admissible ones', () => {
    const rows = deriveInboxRows(items, { dtoFor, actions, hydratedTypes: new Set(['request']) });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ typeId: 'request', instanceId: 'r-1' });
    expect(rows[0].actions).toEqual([actions.approve, actions.reject]);
    expect(rows[0].dto).toBe(dtos['r-1']);
  });

  it('drops rows while their type is still hydrating and rows whose instance left the pool', () => {
    expect(deriveInboxRows(items, { dtoFor, actions, hydratedTypes: new Set() })).toEqual([]);
    const withoutPool = deriveInboxRows(items, {
      dtoFor: () => null,
      actions,
      hydratedTypes: new Set(['request'])
    });
    expect(withoutPool).toEqual([]);
  });

  it('drops actions the contract no longer carries', () => {
    const rows = deriveInboxRows(
      [{ typeId: 'request', instanceId: 'r-1', actionIds: ['approve', 'vanished'] }],
      { dtoFor, actions: { approve: actions.approve }, hydratedTypes: new Set(['request']) }
    );
    expect(rows[0].actions).toEqual([actions.approve]);
  });

  it('keeps the type-label heading client-side: rows carry ids and actions only', () => {
    const rows = deriveInboxRows(items, { dtoFor, actions, hydratedTypes: new Set(['request']) });
    expect(Object.keys(rows[0]).sort()).toEqual(['actions', 'dto', 'instanceId', 'typeId']);
  });
});
