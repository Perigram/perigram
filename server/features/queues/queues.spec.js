import { describe, it, expect, beforeEach, afterAll, beforeAll, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';

const { mockedConnectDB } = vi.hoisted(() => ({
  mockedConnectDB: vi.fn()
}));
vi.mock('~/server/db/mongo', () => ({ connectDB: mockedConnectDB }));

import * as queueService from './service';

vi.mock('h3', () => ({
  createError: vi.fn((err) => {
    const error = new Error(err.message);
    error.statusCode = err.statusCode;
    return error;
  })
}));

vi.mock('~/server/utils/auth-helpers', () => ({
  hasPermission: vi.fn(() => true)
}));

describe('Production Queues & Nesting Status', () => {
  let con;
  let mongoServer;
  let db;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({ replSet: { count: 1 } });
    con = await MongoClient.connect(mongoServer.getUri());
    db = con.db();
    mockedConnectDB.mockReturnValue(db);
  });

  afterAll(async () => {
    if (con) await con.close();
    if (mongoServer) await mongoServer.stop();
  });

  beforeEach(async () => {
    await db.collection('queues').deleteMany({});
    await db.collection('projects').deleteMany({});
  });

  const mockUser = {
    userId: 'user1',
    organizationId: new ObjectId(),
    role: 'ContractorAdmin',
    permissions: null
  };

  mockUser.permissions = {
    memberships: [{ organizationId: mockUser.organizationId, permissions: { queues: 'admin', projects: 'admin' } }]
  };

  it('should create a queue and update project queue count', async () => {
    const projectId = 'test-project';
    await db.collection('projects').insertOne({ 
      _id: projectId,
      identity: { uid: projectId, name: 'Test Project' },
      lineage: { organizationId: mockUser.organizationId },
      summary: { queueCount: 0 }
    });

    const data = { 
      name: 'Morning Shift Run',
      projectId,
      job: { items: [{ entryId: 'E1', cassetteTemplateId: new ObjectId().toString(), quantity: 10 }] }
    };
    const result = await queueService.create(data, mockUser.userId, mockUser.organizationId, mockUser.role, mockUser.permissions);

    expect(result.name).toBe('Morning Shift Run');
    expect(result.status.state).toBe('DRAFT');
    expect(result.lineage.projectId).toBe(projectId);
  });

  it('should mark a queue as CUT only if a run is CHOSEN', async () => {
    const queueId = new ObjectId();
    await db.collection('queues').insertOne({
      _id: queueId,
      identity: { uid: queueId, name: 'Ready queue' },
      lineage: { organizationId: mockUser.organizationId },
      status: { state: 'READY', userId: mockUser.userId, timestamp: new Date(), metadata: {} }
    });

    await expect(queueService.markCut(queueId.toString(), mockUser.userId, mockUser.organizationId, mockUser.role, mockUser.permissions))
      .rejects.toThrow(/No run chosen/);

    await db.collection('nesting_runs').insertOne({
      _id: new ObjectId(),
      lineage: { queueId: queueId.toString() },
      status: { state: 'CHOSEN' }
    });

    const result = await queueService.markCut(queueId.toString(), mockUser.userId, mockUser.organizationId, mockUser.role, mockUser.permissions);
    expect(result.status.state).toBe('CUT');
  });
});
