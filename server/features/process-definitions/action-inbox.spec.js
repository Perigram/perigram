import { describe, expect, it } from 'vitest';
import {
  INBOX_ROW_CAP_PER_ACTION,
  admittingStateFilter,
  getActiveActionInbox,
  selectInboxActions
} from './action-inbox.js';

const transition = { id: 'approve', actionKind: 'updateInstance', typeId: 'request', trigger: { mode: 'manual' }, state: { from: 'submitted', to: 'approved' } };
const noOpFree = { id: 'reopen', actionKind: 'updateInstance', typeId: 'request', trigger: { mode: 'manual' }, state: { to: 'draft' } };

describe('selectInboxActions', () => {
  it('keeps manual instance-addressed state-windowed actions', () => {
    expect(selectInboxActions([transition, noOpFree])).toEqual([transition, noOpFree]);
  });

  it('drops creates — the inbox lists instances, and a create has no instance target', () => {
    const create = { id: 'new-request', actionKind: 'createInstance', typeId: 'request', trigger: { mode: 'manual' }, state: { from: 'draft' } };
    expect(selectInboxActions([create, transition])).toEqual([transition]);
  });

  it('drops actions the hydration manifest does not carry — grant filtering happens there', () => {
    expect(selectInboxActions([{ id: 'secret', actionKind: 'updateInstance', typeId: 'request', state: { from: 'x' } }])).toEqual([]);
  });

  it('drops stateless, non-manual, and untyped actions', () => {
    const stateless = { id: 'wipe', actionKind: 'deleteInstance', typeId: 'request', trigger: { mode: 'manual' } };
    const automatic = { id: 'auto', actionKind: 'updateInstance', typeId: 'request', trigger: { mode: 'event' }, state: { from: 'x' } };
    const untyped = { id: 'loose', actionKind: 'updateInstance', trigger: { mode: 'manual' }, state: { from: 'x' } };
    expect(selectInboxActions([stateless, automatic, untyped])).toEqual([]);
  });
});

describe('admittingStateFilter', () => {
  it('matches the admitting state across every stored primary-state shape', () => {
    const filter = admittingStateFilter(transition);
    for (const path of ['state', 'states.main', 'status.state', 'status.state.primary', 'status.state.active.main']) {
      expect(filter.$or.some(arm => arm[path] === 'submitted'), path).toBe(true);
    }
  });

  it('excludes the no-op state and stateless documents for a to-only action', () => {
    const filter = admittingStateFilter(noOpFree);
    expect(filter.$or.length).toBeGreaterThan(0);
    for (const arm of filter.$or) {
      const constraint = Object.values(arm)[0];
      expect(constraint.$nin).toEqual([null, '', 'draft']);
    }
  });
});

describe('getActiveActionInbox', () => {
  const actions = [
    transition,
    { ...transition, id: 'reject', state: { from: 'submitted', to: 'rejected' } },
    noOpFree
  ];
  const auth = { organizationId: 'org-1', roleAssignments: { actions } };

  // The doc table speaks the flat stored state; the fake query evaluates
  // the built state predicate the way Mongo would (a missing field reads
  // as null).
  function harness(docs, { collectionOf = () => 'requests' } = {}) {
    const queries = [];
    const query = async (collection, filter, { limit }) => {
      queries.push({ collection, filter, limit });
      const matches = docs.filter(doc => {
        const arm = filter.$and[1].$or.find(candidate => 'state' in candidate);
        const value = doc.state ?? null;
        return arm.state.$nin ? !arm.state.$nin.includes(value) : arm.state === value;
      });
      return matches.slice(0, limit).map(({ _id }) => ({ _id }));
    };
    return { query, queries };
  }

  const docs = [
    { _id: 'r-1', state: 'submitted' },
    { _id: 'r-2', state: 'submitted' },
    { _id: 'r-3', state: 'review' },
    { _id: 'r-4', state: 'draft' },
    { _id: 'r-5' }
  ];

  it('returns minimal rows: typeId, instanceId, merged actionIds', async () => {
    const { query } = harness(docs);
    const result = await getActiveActionInbox(auth, { query, collectionOf: () => 'requests' });
    expect(result.items).toEqual([
      { typeId: 'request', instanceId: 'r-1', actionIds: ['approve', 'reject', 'reopen'] },
      { typeId: 'request', instanceId: 'r-2', actionIds: ['approve', 'reject', 'reopen'] },
      { typeId: 'request', instanceId: 'r-3', actionIds: ['reopen'] }
    ]);
  });

  it('bounds every per-action query and scopes it to the organization and type', async () => {
    const { query, queries } = harness(docs);
    await getActiveActionInbox(auth, { query, collectionOf: () => 'requests' });
    expect(queries.length).toBe(3);
    for (const ran of queries) {
      expect(ran.collection).toBe('requests');
      expect(ran.limit).toBe(INBOX_ROW_CAP_PER_ACTION);
      expect(ran.filter.type).toBe('request');
      expect(ran.filter.$and[0].$or).toEqual([{ organizationId: 'org-1' }, { organizationId: null }]);
    }
  });

  it('caps rows per action at the documented bound', async () => {
    const many = Array.from({ length: INBOX_ROW_CAP_PER_ACTION + 5 }, (_, index) => ({ _id: `r-${index}`, state: 'submitted' }));
    const { query } = harness(many);
    const result = await getActiveActionInbox(auth, { query, collectionOf: () => 'requests' });
    expect(result.items.length).toBe(INBOX_ROW_CAP_PER_ACTION);
  });

  it('yields empty items without grant-carried actions or a per-class collection', async () => {
    const { query, queries } = harness(docs);
    const grantless = await getActiveActionInbox({ organizationId: 'org-1', roleAssignments: { actions: [] } }, { query, collectionOf: () => 'requests' });
    expect(grantless).toEqual({ items: [] });

    const unserved = await getActiveActionInbox(auth, { query, collectionOf: () => null });
    expect(unserved).toEqual({ items: [] });
    expect(queries.length).toBe(0);
  });
});
