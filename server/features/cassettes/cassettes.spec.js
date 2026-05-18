import { describe, it, expect, beforeEach, afterAll, beforeAll, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';

const { mockedConnectDB } = vi.hoisted(() => ({
  mockedConnectDB: vi.fn()
}));
vi.mock('~/server/db/mongo', () => ({ connectDB: mockedConnectDB }));

import * as cassetteService from './service';

vi.mock('h3', () => ({
  createError: vi.fn((err) => {
    const error = new Error(err.message);
    error.statusCode = err.statusCode;
    return error;
  })
}));

describe('Cassette Management & Ownership', () => {
  let con;
  let mongoServer;
  let db;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    con = await MongoClient.connect(mongoServer.getUri());
    db = con.db();
    mockedConnectDB.mockReturnValue(db);
  });

  afterAll(async () => {
    if (con) await con.close();
    if (mongoServer) await mongoServer.stop();
  });

  beforeEach(async () => {
    await db.collection('cassettes').deleteMany({});
  });

  const user1 = {
    userId: 'user1',
    organizationId: new ObjectId(),
    permissions: null
  };

  const user2 = {
    userId: 'user2',
    organizationId: new ObjectId(),
    permissions: null
  };

  user1.permissions = {
    memberships: [{ organizationId: user1.organizationId, permissions: { cassettes: 'admin' } }]
  };
  user2.permissions = {
    memberships: [{ organizationId: user2.organizationId, permissions: { cassettes: 'admin' } }]
  };

  it('should create a standard cassette', async () => {
    const data = { name: 'Standard Unit', type: 'STANDARD' };
    const result = await cassetteService.create(data, user1.userId, user1.organizationId, 'ContractorAdmin', user1.permissions);

    expect(result.identity.name).toBe('Standard Unit');
    expect(result.data.type).toBe('STANDARD');
    expect(result).not.toHaveProperty('name');
    expect(result).not.toHaveProperty('type');
    expect(result.lineage.organizationId.toString()).toBe(user1.organizationId.toString());
  });

  it('should create a parametric cassette and extract params', async () => {
    const data = { 
      name: 'Smart Box',
      data: {
        params: { width: 100, height: 200 }
      }
    };
    const result = await cassetteService.create(data, user1.userId, user1.organizationId, 'ContractorAdmin', user1.permissions);

    expect(result.data.type).toBe('PARAMETRIC');
    expect(result.data.definition.params.width).toBe(100);
    expect(result.data.definition.params.height).toBe(200);
  });

  it('should deny access to cassettes owned by other users', async () => {
    const cassette = await cassetteService.create({ name: 'Private Template' }, user1.userId, user1.organizationId, 'ContractorAdmin', user1.permissions);

    await expect(cassetteService.getById(
      cassette._id.toString(), 
      user2.userId, 
      user2.organizationId, 
      'ContractorAdmin', 
      user2.permissions
    )).rejects.toThrow(/Permission denied/);
  });

  it('should allow SuperAdmin to access any cassette', async () => {
    const cassette = await cassetteService.create({ name: 'User 1 Template' }, user1.userId, user1.organizationId, 'ContractorAdmin', user1.permissions);

    const result = await cassetteService.getById(
      cassette._id.toString(), 
      'admin-id', 
      null, 
      'SuperAdmin', 
      { memberships: [] }
    );
    expect(result.identity.name).toBe('User 1 Template');
  });
});
