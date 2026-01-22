import { describe, it, expect, beforeEach, afterAll, beforeAll, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';

const { mockedConnectDB } = vi.hoisted(() => ({
  mockedConnectDB: vi.fn()
}));
vi.mock('~/server/db/mongo', () => ({ connectDB: mockedConnectDB }));

import * as userService from './service';

vi.mock('h3', () => ({
  createError: vi.fn((err) => {
    const error = new Error(err.message);
    error.statusCode = err.statusCode;
    return error;
  })
}));

// Mock argon2 because it's a binary dependency
vi.mock('argon2', () => ({
  default: {
    hash: vi.fn(() => 'hashed_password'),
    verify: vi.fn((hash, pass) => pass === 'correct_password')
  }
}));

describe('User Management & Auth', () => {
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
    await db.collection('users').deleteMany({});
  });

  it('should register a user with correct permission template', async () => {
    const data = {
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User',
      role: 'ManufacturerAdmin'
    };

    const user = await userService.register(data);
    
    expect(user.email).toBe('test@example.com');
    expect(user.role).toBe('ManufacturerAdmin');
    expect(user.permissions.catalogs).toBe('admin');
    expect(user.isActive).toBe(true);
  });

  it('should allow switching organizations if membership exists', async () => {
    const org1 = new ObjectId();
    const org2 = new ObjectId();
    
    const user = await db.collection('users').insertOne({
      name: 'Multi-org User',
      organizationId: org1,
      memberships: [
        { organizationId: org1, role: 'ContractorAdmin', permissions: {} },
        { organizationId: org2, role: 'IndividualUser', permissions: {} }
      ]
    });

    const updatedUser = await userService.switchOrganization(user.insertedId.toString(), org2.toString());
    
    expect(updatedUser.organizationId.toString()).toBe(org2.toString());
    expect(updatedUser.role).toBe('IndividualUser');
  });

  it('should deny switching to an organization without membership', async () => {
    const org1 = new ObjectId();
    const fakeOrg = new ObjectId();
    
    const user = await db.collection('users').insertOne({
      organizationId: org1,
      memberships: [{ organizationId: org1 }]
    });

    await expect(userService.switchOrganization(user.insertedId.toString(), fakeOrg.toString()))
      .rejects.toThrow(/not a member/);
  });
});