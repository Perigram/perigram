import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';

const { mockedConnectDB } = vi.hoisted(() => ({
  mockedConnectDB: vi.fn()
}));
vi.mock('~/server/db/mongo', () => ({ connectDB: mockedConnectDB }));

import { buildWorklist } from './worklist.js';
import * as workflowOverridesService from '~/server/features/workflow-overrides/service.js';
import { getPerigramRegistry } from '~/server/runtime/perigram-registry.js';

const reviewMachine = {
  primaryRegion: 'main',
  regions: {
    main: {
      initial: 'ACTIVE',
      states: {
        ACTIVE: {},
        REVIEW: { deadline: { after: 'PT48H', to: 'ESCALATED' } },
        APPROVED: { terminal: true },
        ESCALATED: { terminal: true }
      },
      transitions: [
        { from: 'REVIEW', to: 'APPROVED' },
        { from: 'REVIEW', to: 'ESCALATED', deadline: true, access: { system: true } }
      ]
    }
  }
};

const auth = {
  userId: 'admin-1',
  organizationId: 'org-1',
  memberships: [{ organizationId: 'org-1', permissions: {} }],
  roleAssignments: {
    actions: [
      { id: 'approve', actionKind: 'updateInstance', typeId: 'cassette', state: { from: 'REVIEW', to: 'APPROVED' }, label: 'Approve' },
      // Unscoped updates are instance-surface concerns, not inbox rows.
      { id: 'rename', actionKind: 'updateInstance', typeId: 'cassette', label: 'Rename' },
      { id: 'other', actionKind: 'updateInstance', typeId: 'queue', state: { from: 'NEW', to: 'RUNNING' }, label: 'Run' }
    ]
  }
};

const instance = (state, stateChangedAt, name) => ({
  _id: new ObjectId(),
  type: 'cassette',
  organizationId: 'org-1',
  name,
  fields: {},
  state,
  ...(stateChangedAt ? { stateChangedAt } : {})
});

describe('worklist', () => {
  let con;
  let mongoServer;
  let db;

  beforeAll(async () => {
    mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    con = await MongoClient.connect(mongoServer.getUri());
    db = con.db();
    mockedConnectDB.mockReturnValue(db);
    getPerigramRegistry().defineEntity({ type: 'cassette', collection: 'files', feature: 'cassettes' });
  });

  afterAll(async () => {
    if (con) await con.close();
    if (mongoServer) await mongoServer.stop();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    mockedConnectDB.mockReturnValue(db);
    await db.collection('files').deleteMany({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists windowed instances with deadline urgency, overdue first', async () => {
    vi.spyOn(workflowOverridesService, 'resolveActiveWorkflow').mockResolvedValue(reviewMachine);
    const now = new Date();
    await db.collection('files').insertMany([
      instance('REVIEW', new Date(now.getTime() - 72 * 3600 * 1000).toISOString(), 'Old review'),
      instance('REVIEW', new Date(now.getTime() - 3600 * 1000).toISOString(), 'Fresh review'),
      instance('ACTIVE', null, 'Not mine to move')
    ]);

    const { items } = await buildWorklist(auth, now);
    expect(items).toHaveLength(2);
    expect(items.map(item => item.name)).toEqual(['Old review', 'Fresh review']);
    expect(items[0].overdue).toBe(true);
    expect(items[0].actions).toEqual([{ id: 'approve', label: 'Approve', to: 'APPROVED' }]);
    expect(items[1].overdue).toBe(false);
    expect(items[1].dueAt).toBeTruthy();
    // The ACTIVE instance is outside every manifest window.
    expect(items.some(item => item.name === 'Not mine to move')).toBe(false);
  });

  it('returns nothing without an organization context', async () => {
    const { items } = await buildWorklist({ userId: 'u', memberships: [] });
    expect(items).toEqual([]);
  });
});
