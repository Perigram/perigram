import { describe, it, expect, beforeEach, afterAll, beforeAll, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';

const { mockedConnectDB } = vi.hoisted(() => ({
  mockedConnectDB: vi.fn()
}));
vi.mock('~/server/db/mongo', () => ({ connectDB: mockedConnectDB }));

import * as userService from './service';
import * as organizationService from '../organizations/service';
import { User } from './model';

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
    await db.collection('organizations').deleteMany({});
  });

  it('should register a user with correct permission template', async () => {
    const data = {
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User',
      role: 'ManufacturerAdmin'
    };

    const user = await userService.register(data);
    
    const dto = user.toJSON();
    expect(dto.data.email).toBe('test@example.com');
    expect(dto.data.role).toBe('ManufacturerAdmin');
    expect(dto.data.permissions.catalogs).toBe('admin');
    expect(dto.data.isActive).toBe(true);
    expect(dto).not.toHaveProperty('email');
    expect(dto).not.toHaveProperty('role');

    const raw = await db.collection('users').findOne({ 'data.email': 'test@example.com' });
    expect(raw.data.passwordHash).toBe('hashed_password');
  });

  it('should allow login after registration', async () => {
    await userService.register({
      email: 'login@example.com',
      password: 'password123',
      name: 'Login User'
    });

    const result = await userService.login('login@example.com', 'correct_password');

    expect(result.user.toJSON().data.email).toBe('login@example.com');
    expect(result.sessionId).toBeTruthy();
    expect(result.accessToken).toBeTruthy();
  });

  it('should create an initial organization membership for signup users', async () => {
    const user = await userService.register({
      email: 'owner@example.com',
      password: 'password123',
      name: 'Owner User'
    });

    const organization = await organizationService.createInitialForUser(user.id, {
      name: 'Owner Workshop',
      type: 'Contractor'
    });

    const rawUser = await db.collection('users').findOne({ 'data.email': 'owner@example.com' });
    expect(organization.toJSON().identity.name).toBe('Owner Workshop');
    expect(rawUser.lineage.organizationId.toString()).toBe(organization.id);
    expect(rawUser.data.role).toBe('ContractorAdmin');
    expect(rawUser.data.permissions.projects).toBe('admin');
    expect(rawUser.data.memberships[0].organizationId.toString()).toBe(organization.id);
    expect(rawUser.data.memberships[0].status).toBe('active');
  });

  it('should recover a pre-organization signup only with the existing password', async () => {
    await userService.register({
      email: 'orphan@example.com',
      password: 'password123',
      name: 'Orphan User'
    });

    await expect(userService.recoverSignupWithoutOrganization('orphan@example.com', 'wrong_password'))
      .rejects.toMatchObject({ statusCode: 409 });

    const recovered = await userService.recoverSignupWithoutOrganization('orphan@example.com', 'correct_password');
    expect(recovered.toJSON().data.email).toBe('orphan@example.com');
    expect(recovered.memberships).toEqual([]);
  });

  it('should allow switching organizations if membership exists', async () => {
    const org1 = new ObjectId();
    const org2 = new ObjectId();
    
    const user = await db.collection('users').insertOne({
      identity: { uid: 'multi-org-user', name: 'Multi-org User' },
      lineage: { organizationId: org1 },
      data: {
      memberships: [
        { organizationId: org1, role: 'IndividualUser', permissions: {} },
        { organizationId: org2, role: 'IndividualUser', permissions: {} }
      ]
      }
    });

    const updatedUser = await userService.switchOrganization(user.insertedId.toString(), org2.toString());
    
    expect(updatedUser.toJSON().lineage.organizationId.toString()).toBe(org2.toString());
    expect(updatedUser.toJSON().data.role).toBe('IndividualUser');
  });

  it('does not expand preset labels into permissions when loading users', () => {
    const orgId = new ObjectId();
    const user = new User({
      _id: 'user-legacy',
      identity: { uid: 'user-legacy', name: 'Legacy User' },
      data: {
        role: 'IndividualUser',
        permissions: { queues: 'admin' },
        memberships: [{
          organizationId: orgId,
          role: 'IndividualUser',
          permissions: { queues: 'admin', artifacts: 'none' }
        }]
      }
    });

    expect(user.permissions.queues).toBe('admin');
    expect(user.permissions.nesting_runs).toBeUndefined();
    expect(user.permissions.artifacts).toBeUndefined();
    expect(user.memberships[0].permissions.nesting_runs).toBeUndefined();
    expect(user.memberships[0].permissions.artifacts).toBe('none');
  });

  it('should deny switching to an organization without membership', async () => {
    const org1 = new ObjectId();
    const fakeOrg = new ObjectId();
    
    const user = await db.collection('users').insertOne({
      identity: { uid: 'single-org-user', name: 'Single-org User' },
      lineage: { organizationId: org1 },
      data: { memberships: [{ organizationId: org1 }] }
    });

    await expect(userService.switchOrganization(user.insertedId.toString(), fakeOrg.toString()))
      .rejects.toThrow(/not a member/);
  });
});
