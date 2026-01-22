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
    permissions: { queues: 'admin' }
  };

  it('should create a queue and update project queue count', async () => {
    const projectSlug = 'test-project';
    await db.collection('projects').insertOne({ 
      slug: projectSlug, 
      organizationId: mockUser.organizationId,
      queueCount: 0 
    });

    const data = { 
      name: 'Morning Shift Run',
      projectSlug: projectSlug,
      entries: [{
        entryId: 'E1',
        cassetteTemplateId: new ObjectId().toString(),
        quantity: 10
      }]
    };
    const result = await queueService.create(data, mockUser.userId, mockUser.organizationId, mockUser.role, mockUser.permissions);

    expect(result.name).toBe('Morning Shift Run');
    expect(result.statusHistory[0].status).toBe('DRAFT');
    
    const project = await db.collection('projects').findOne({ slug: projectSlug });
    expect(project.queueCount).toBe(1);
  });

  it('should mark a queue as CUT only if a run is CHOSEN', async () => {
    const queueId = new ObjectId();
    await db.collection('queues').insertOne({
      _id: queueId,
      ownerId: mockUser.userId,
      status: 'READY',
      runs: [{ _id: new ObjectId(), status: 'COMPLETE' }],
      entries: [] // Fix: ensure entries exists
    });

    await expect(queueService.markCut(queueId.toString(), mockUser.userId, mockUser.organizationId, mockUser.role, mockUser.permissions))
      .rejects.toThrow(/Choose a completed run/);

    await db.collection('queues').updateOne(
      { _id: queueId },
      { $set: { "runs.0.status": 'CHOSEN', chosenRunId: new ObjectId() } }
    );

    const result = await queueService.updateStatus(queueId.toString(), 'CUT', mockUser.userId, mockUser.organizationId, mockUser.role, mockUser.permissions);
    expect(result.status).toBe('CUT');
  });
});