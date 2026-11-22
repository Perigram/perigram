import { describe, it, expect, beforeEach, afterAll, beforeAll, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';

const { mockedConnectDB, mockedUploadFile, mockedDeleteFile, mockedGetFileStream } = vi.hoisted(() => ({
  mockedConnectDB: vi.fn(),
  mockedUploadFile: vi.fn(),
  mockedDeleteFile: vi.fn(),
  mockedGetFileStream: vi.fn()
}));
vi.mock('~/server/db/mongo', () => ({ connectDB: mockedConnectDB }));
vi.mock('../files/service.js', () => ({
  uploadFile: mockedUploadFile,
  deleteFile: mockedDeleteFile,
  getFileStream: mockedGetFileStream
}));

import * as userService from './service';
import * as organizationService from '../organizations/service';
import { User } from './model';
import { applyOwnerPermissionsToAuth } from './organization-owner';

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
    vi.clearAllMocks();
    await db.collection('users').deleteMany({});
    await db.collection('organizations').deleteMany({});
    await db.collection('process_definitions').deleteMany({});
  });

  it('stores avatar metadata behind a derived user avatar URL', async () => {
    const user = await userService.register({
      email: 'avatar@example.com',
      password: 'password123',
      name: 'Avatar User'
    });
    mockedUploadFile.mockResolvedValue({ id: 'avatar-file-1' });

    const updated = await userService.saveAvatar(user.id, {
      buffer: Buffer.from('image'),
      filename: 'avatar.png',
      mimeType: 'image/png'
    }, { userId: user.id });

    expect(updated.toJSON().data.avatarUrl).toMatch(new RegExp(`^/api/users/${user.id}/avatar\\?v=`));
    expect(updated.toJSON().data.avatar).toBeUndefined();
    expect(mockedUploadFile).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.stringContaining(`avatar-${user.id}-`),
      expect.objectContaining({ userId: String(user.id), mimeType: 'image/png' }),
      'avatars'
    );
  });

  it('rejects avatar changes for unrelated users', async () => {
    const user = await userService.register({
      email: 'protected-avatar@example.com',
      password: 'password123',
      name: 'Protected Avatar'
    });
    await expect(userService.saveAvatar(user.id, {
      buffer: Buffer.from('image'),
      mimeType: 'image/png'
    }, { userId: 'other-user', memberships: [] })).rejects.toMatchObject({ statusCode: 403 });
  });

  it('registers identity without duplicating organization role state', async () => {
    const data = {
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User',
    };

    const user = await userService.register(data);
    
    const dto = user.toJSON();
    expect(dto.data.email).toBe('test@example.com');
    expect(dto.data.role).toBeUndefined();
    expect(dto.data.permissions).toEqual({});
    expect(dto.data.isActive).toBeUndefined();
    expect(dto).not.toHaveProperty('email');
    expect(dto).not.toHaveProperty('role');

    const raw = await db.collection('users').findOne({ 'data.email': 'test@example.com' });
    expect(raw.data.passwordHash).toBe('hashed_password');
  });

  it('does not let an ordinary member create a user inside an organization', async () => {
    const owner = await userService.register({
      email: 'org-owner@example.com',
      password: 'password123',
      name: 'Org Owner'
    });
    const organization = await organizationService.createInitialForUser(owner.id, {
      name: 'Protected Organization',
      type: 'Contractor'
    });

    await expect(userService.register({
      email: 'injected@example.com',
      password: 'password123',
      name: 'Injected User',
      organizationId: organization.id,
      roleIds: ['role_admin']
    }, {
      userId: 'ordinary-member',
      organizationId: organization.id,
      memberships: [{
        organizationId: organization.id,
        permissions: { users: { level: 'read' } },
        status: 'active'
      }]
    })).rejects.toMatchObject({ statusCode: 403 });

    expect(await userService.findUserByEmail('injected@example.com')).toBeNull();
  });

  it('allows a user administrator to create an organization member with assigned roles', async () => {
    const owner = await userService.register({
      email: 'org-admin@example.com',
      password: 'password123',
      name: 'Org Admin'
    });
    const organization = await organizationService.createInitialForUser(owner.id, {
      name: 'Managed Organization',
      type: 'Contractor'
    });
    const refreshedOwner = await userService.getById(owner.id);
    const auth = userService.buildAuthContext(refreshedOwner);

    const created = await userService.register({
      email: 'managed-member@example.com',
      password: 'password123',
      name: 'Managed Member',
      organizationId: organization.id,
      roleIds: ['role_admin']
    }, auth);

    expect(created.memberships.some(membership => String(membership.organizationId) === String(organization.id))).toBe(true);
    const rawOrganization = await db.collection('organizations').findOne({ _id: organization.id });
    expect(rawOrganization.data.roleAssignments[String(created.id)].roleIds).toEqual(['role_admin']);
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
    expect(rawUser.data.role).toBeUndefined();
    expect(rawUser.data.memberships[0].organizationId.toString()).toBe(organization.id);
    expect(rawUser.data.memberships[0].owner).toBe(true);
    expect(rawUser.data.memberships[0].permissions).toEqual({
      organizations: { level: 'admin' },
      users: { level: 'admin' }
    });
    expect(rawUser.data.memberships[0].status).toBe('active');
    const rawOrganization = await db.collection('organizations').findOne({ _id: rawUser.data.memberships[0].organizationId });
    expect(rawOrganization.data.roleAssignments[String(user.id)].roleIds).toEqual(['role_admin']);
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
    expect(updatedUser.toJSON().data.role).toBeUndefined();
  });

  it('rejects switching into an organization with a suspended membership', async () => {
    const organizationId = new ObjectId();
    const user = await db.collection('users').insertOne({
      identity: { uid: 'suspended-multi-org-user', name: 'Suspended User' },
      lineage: { organizationId: new ObjectId() },
      data: {
        memberships: [{
          organizationId,
          permissions: { organizations: 'admin' },
          status: 'suspended'
        }]
      }
    });

    await expect(userService.switchOrganization(
      user.insertedId.toString(),
      organizationId.toString()
    )).rejects.toMatchObject({ statusCode: 403 });
    const unchanged = await db.collection('users').findOne({ _id: user.insertedId });
    expect(unchanged.lineage.organizationId.toString()).not.toBe(organizationId.toString());
  });

  it('rejects switching into an organization with a pending membership', async () => {
    const organizationId = new ObjectId();
    const user = await db.collection('users').insertOne({
      identity: { uid: 'pending-multi-org-user', name: 'Pending User' },
      lineage: { organizationId: new ObjectId() },
      data: {
        memberships: [{ organizationId, permissions: {}, status: 'pending' }]
      }
    });

    await expect(userService.switchOrganization(
      user.insertedId.toString(),
      organizationId.toString()
    )).rejects.toMatchObject({ statusCode: 403 });
  });

  it('leaves an active organization and selects another active membership', async () => {
    const org1 = new ObjectId();
    const org2 = new ObjectId();
    const userId = new ObjectId();
    await db.collection('users').insertMany([{
      _id: userId,
      identity: { uid: 'leaving-user', name: 'Leaving User' },
      lineage: { organizationId: org1 },
      data: {
        permissions: { organizations: { level: 'admin' } },
        memberships: [
          { organizationId: org1, permissions: { organizations: { level: 'admin' } }, status: 'active' },
          { organizationId: org2, permissions: { users: { level: 'admin' } }, status: 'active' }
        ]
      }
    }, {
      identity: { uid: 'remaining-user', name: 'Remaining User' },
      data: { memberships: [{ organizationId: org1, permissions: {}, status: 'active' }] }
    }]);

    await expect(userService.leaveOrganization(userId.toString(), org1.toString()))
      .resolves.toEqual({ success: true });

    const updated = await db.collection('users').findOne({ _id: userId });
    expect(updated.data.memberships.map(item => item.organizationId.toString())).toEqual([org2.toString()]);
    expect(updated.lineage.organizationId.toString()).toBe(org2.toString());
    expect(updated.data.permissions).toEqual({ users: { level: 'admin' } });
  });

  it('leaves the last organization and becomes orgless', async () => {
    const orgId = new ObjectId();
    const userId = new ObjectId();
    await db.collection('users').insertMany([{
      _id: userId,
      identity: { uid: 'orgless-user', name: 'Orgless User' },
      lineage: { organizationId: orgId },
      data: {
        permissions: { organizations: { level: 'admin' } },
        memberships: [{ organizationId: orgId, permissions: { organizations: { level: 'admin' } }, status: 'active' }]
      }
    }, {
      identity: { uid: 'remaining-user', name: 'Remaining User' },
      data: { memberships: [{ organizationId: orgId, permissions: {}, status: 'active' }] }
    }]);

    await expect(userService.leaveOrganization(userId.toString(), orgId.toString()))
      .resolves.toEqual({ success: true });

    const updated = await db.collection('users').findOne({ _id: userId });
    expect(updated.data.memberships).toEqual([]);
    expect(updated.lineage.organizationId ?? null).toBeNull();
    expect(updated.data.permissions).toEqual({});
  });

  it('refuses to leave as the last active organization user', async () => {
    const orgId = new ObjectId();
    const userId = new ObjectId();
    await db.collection('users').insertOne({
      _id: userId,
      identity: { uid: 'sole-user', name: 'Sole User' },
      lineage: { organizationId: orgId },
      data: { memberships: [{ organizationId: orgId, permissions: {}, status: 'active' }] }
    });

    await expect(userService.leaveOrganization(userId.toString(), orgId.toString()))
      .rejects.toMatchObject({ statusCode: 409 });
    const unchanged = await db.collection('users').findOne({ _id: userId });
    expect(unchanged.data.memberships).toHaveLength(1);
  });

  it('hydrates auth from active membership rather than a stale suspended tenant', () => {
    const suspendedOrg = new ObjectId();
    const activeOrg = new ObjectId();
    const user = new User({
      _id: new ObjectId(),
      identity: { uid: 'multi-org-auth', name: 'Multi Org Auth' },
      lineage: { organizationId: suspendedOrg },
      data: {
        permissions: { organizations: 'admin' },
        memberships: [
          { organizationId: suspendedOrg, status: 'suspended', permissions: { organizations: 'admin' } },
          { organizationId: activeOrg, status: 'active', permissions: { organizations: 'read' } }
        ]
      }
    });

    const auth = userService.buildAuthContext(user);
    expect(auth.organizationId).toBe(activeOrg.toString());
    expect(auth.permissions).toEqual({ organizations: 'read' });
    expect(auth.memberships.map(item => item.organizationId.toString())).toEqual([activeOrg.toString()]);
  });

  it('removes tenant context and stale grants when every membership is inactive', () => {
    const organizationId = new ObjectId();
    const user = new User({
      _id: new ObjectId(),
      identity: { uid: 'pending-auth', name: 'Pending Auth' },
      lineage: { organizationId },
      data: {
        permissions: { organizations: 'admin', users: 'admin' },
        memberships: [{
          organizationId,
          status: 'pending',
          permissions: { organizations: 'admin', users: 'admin' }
        }]
      }
    });

    const auth = userService.buildAuthContext(user);
    expect(auth.organizationId).toBeNull();
    expect(auth.permissions).toEqual({});
    expect(auth.memberships).toEqual([]);
  });

  it('does not carry a stale tenant permission snapshot into an orgless auth context', () => {
    const user = new User({
      _id: new ObjectId(),
      identity: { uid: 'orgless-auth', name: 'Orgless Auth' },
      data: { permissions: { organizations: 'admin', users: 'admin' }, memberships: [] }
    });

    const auth = userService.buildAuthContext(user);
    expect(auth.organizationId).toBeNull();
    expect(auth.permissions).toEqual({});
    expect(auth.memberships).toEqual([]);
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
          permissions: { queues: 'admin', files: 'none' }
        }]
      }
    });

    expect(user.permissions.queues).toBe('admin');
    expect(user.permissions.nesting_runs).toBeUndefined();
    expect(user.permissions.files).toBeUndefined();
    expect(user.memberships[0].permissions.nesting_runs).toBeUndefined();
    expect(user.memberships[0].permissions.files).toBe('none');
  });

  it('does not let compiled user-admin grants override an inactive membership', async () => {
    const orgId = new ObjectId();
    expect(await userService.canManageUsersInOrganization({
      organizationId: orgId,
      effectivePermissions: { users: 'admin' },
      memberships: [{
        organizationId: orgId,
        status: 'pending',
        permissions: { users: 'admin' }
      }]
    }, orgId)).toBe(false);
  });

  it('does not treat membership role labels as user-management grants', async () => {
    const orgId = new ObjectId();

    expect(await userService.canManageUsersInOrganization({
      userId: 'admin-user',
      memberships: [{
        organizationId: orgId,
        role: 'role_admin',
        permissions: {},
        status: 'active'
      }]
    }, orgId)).toBe(false);
  });

  it('lists active-organization users when auth memberships are not populated', async () => {
    const orgId = new ObjectId();
    await db.collection('users').insertMany([{
      _id: new ObjectId(),
      identity: { uid: 'user-one', name: 'User One' },
      data: {
        memberships: [{ organizationId: orgId, role: 'operator', permissions: {}, status: 'active' }]
      }
    }, {
      _id: new ObjectId(),
      identity: { uid: 'user-two', name: 'User Two' },
      data: {
        memberships: [{ organizationId: orgId.toString(), role: 'operator', permissions: {}, status: 'active' }]
      }
    }]);

    const users = await userService.list({ userId: 'user-one', organizationId: orgId.toString(), memberships: [] });

    expect(users.map(user => user.toJSON().identity.name).sort()).toEqual(['User One', 'User Two']);
  });

  it('allows stored membership user-admin grants to recover user management when process grants are missing', async () => {
    const orgId = new ObjectId();
    const userId = new ObjectId();
    await db.collection('users').insertMany([{
      _id: userId,
      identity: { uid: userId.toString(), name: 'Admin User' },
      data: {
        memberships: [{
          organizationId: orgId,
          role: 'ContractorAdmin',
          permissions: { users: { level: 'admin' } },
          status: 'active'
        }]
      }
    }, {
      _id: new ObjectId(),
      identity: { uid: 'other-user', name: 'Other User' },
      data: {
        memberships: [{ organizationId: orgId, role: 'role_viewer', permissions: {}, status: 'active' }]
      }
    }]);

    expect(await userService.canManageUsersInOrganization({
      userId: userId.toString(),
      effectivePermissions: {},
      memberships: [{
        organizationId: orgId,
        role: 'ContractorAdmin',
        permissions: { users: { level: 'admin' } },
        status: 'active'
      }]
    }, orgId)).toBe(true);
  });

  it('allows owner membership to recover user management even when copied grants are missing', async () => {
    const orgId = new ObjectId();

    expect(await userService.canManageUsersInOrganization({
      userId: 'owner-user',
      effectivePermissions: {},
      memberships: [{
        organizationId: orgId,
        role: 'role_admin',
        permissions: {},
        owner: true,
        status: 'active'
      }]
    }, orgId)).toBe(true);
  });

  it('merges owner grants after process effective permissions are resolved', () => {
    const orgId = new ObjectId();
    const auth = applyOwnerPermissionsToAuth({
      userId: 'owner-user',
      organizationId: orgId,
      effectivePermissions: {},
      memberships: [{
        organizationId: orgId,
        owner: true,
        permissions: {},
        status: 'active'
      }]
    });

    expect(auth.effectivePermissions).toEqual({
      organizations: { level: 'admin' },
      users: { level: 'admin' }
    });
  });

  it('keeps admin grants unmerged without the owner flag', () => {
    const orgId = new ObjectId();
    const auth = applyOwnerPermissionsToAuth({
      userId: 'legacy-admin',
      organizationId: orgId,
      effectivePermissions: {},
      memberships: [{
        organizationId: orgId,
        permissions: {
          organizations: { level: 'admin' },
          users: { level: 'admin' }
        },
        status: 'active'
      }]
    });

    expect(auth.effectivePermissions).toEqual({});
  });

  it('keeps top-level admin grants unmerged without an owner membership', () => {
    const orgId = new ObjectId();
    const auth = applyOwnerPermissionsToAuth({
      userId: 'legacy-owner',
      organizationId: orgId,
      permissions: {
        organizations: { level: 'admin' },
        users: { level: 'admin' }
      },
      effectivePermissions: {},
      memberships: [{
        organizationId: orgId,
        permissions: {},
        status: 'active'
      }]
    });

    expect(auth.effectivePermissions).toEqual({});
  });

  it('prevents removing the last active organization user', async () => {
    const orgId = new ObjectId();
    const ownerId = new ObjectId();
    await db.collection('users').insertOne({
      _id: ownerId,
      identity: { uid: 'owner-user', name: 'Owner User' },
      data: {
        memberships: [{
          organizationId: orgId,
          role: 'role_admin',
          permissions: { users: { level: 'admin' }, organizations: { level: 'admin' } },
          owner: true,
          status: 'active'
        }]
      }
    });

    await expect(userService.remove(ownerId.toString(), {
      userId: ownerId.toString(),
      organizationId: orgId,
      memberships: [{ organizationId: orgId, owner: true, permissions: {}, status: 'active' }]
    })).rejects.toMatchObject({ statusCode: 409 });
  });

  it('prevents removing the last owner admin when other members remain', async () => {
    const orgId = new ObjectId();
    const ownerId = new ObjectId();
    await db.collection('users').insertMany([{
      _id: ownerId,
      identity: { uid: 'owner-user', name: 'Owner User' },
      data: {
        memberships: [{
          organizationId: orgId,
          role: 'role_admin',
          permissions: { users: { level: 'admin' }, organizations: { level: 'admin' } },
          owner: true,
          status: 'active'
        }]
      }
    }, {
      _id: new ObjectId(),
      identity: { uid: 'member-user', name: 'Member User' },
      data: {
        memberships: [{ organizationId: orgId, role: 'role_worker', permissions: {}, status: 'active' }]
      }
    }]);

    await expect(userService.remove(ownerId.toString(), {
      userId: ownerId.toString(),
      organizationId: orgId,
      memberships: [{ organizationId: orgId, owner: true, permissions: {}, status: 'active' }]
    })).rejects.toMatchObject({ statusCode: 409 });
  });

  it('allows removing an owner when another active owner remains', async () => {
    const orgId = new ObjectId();
    const ownerId = new ObjectId();
    const otherOwnerId = new ObjectId();
    await db.collection('users').insertMany([{
      _id: ownerId,
      identity: { uid: 'owner-user', name: 'Owner User' },
      data: {
        memberships: [{
          organizationId: orgId,
          role: 'role_admin',
          permissions: { users: { level: 'admin' }, organizations: { level: 'admin' } },
          owner: true,
          status: 'active'
        }]
      }
    }, {
      _id: otherOwnerId,
      identity: { uid: 'other-owner', name: 'Other Owner' },
      data: {
        memberships: [{
          organizationId: orgId,
          role: 'role_admin',
          permissions: { users: { level: 'admin' }, organizations: { level: 'admin' } },
          owner: true,
          status: 'active'
        }]
      }
    }]);

    await expect(userService.remove(ownerId.toString(), {
      userId: otherOwnerId.toString(),
      organizationId: orgId,
      memberships: [{ organizationId: orgId, owner: true, permissions: {}, status: 'active' }]
    })).resolves.toEqual({ success: true });

    const removed = await db.collection('users').findOne({ _id: ownerId });
    expect(removed.data.memberships).toEqual([]);
  });

  it('preserves owner admin grants when membership permissions are updated', async () => {
    const orgId = new ObjectId();
    const ownerId = new ObjectId();
    await db.collection('users').insertOne({
      _id: ownerId,
      identity: { uid: 'owner-user', name: 'Owner User' },
      data: {
        memberships: [{
          organizationId: orgId,
          role: 'role_admin',
          permissions: { users: { level: 'admin' }, organizations: { level: 'admin' } },
          owner: true,
          status: 'active'
        }]
      }
    });

    await userService.updatePermissions(ownerId.toString(), {}, {
      userId: ownerId.toString(),
      organizationId: orgId,
      memberships: [{ organizationId: orgId, owner: true, permissions: {}, status: 'active' }]
    });

    const owner = await db.collection('users').findOne({ _id: ownerId });
    expect(owner.data.memberships[0].permissions).toEqual({
      organizations: { level: 'admin' },
      users: { level: 'admin' }
    });
  });

  it('does not treat sole active membership as user-management access', async () => {
    const orgId = new ObjectId();
    const userId = new ObjectId();
    await db.collection('users').insertOne({
      _id: userId,
      identity: { uid: 'solo-user', name: 'Solo User' },
      data: {
        memberships: [{ organizationId: orgId, role: 'IndividualUser', permissions: {}, status: 'active' }]
      }
    });

    expect(await userService.canManageUsersInOrganization({
      userId: userId.toString(),
      memberships: [{ organizationId: orgId, role: 'IndividualUser', permissions: {}, status: 'active' }]
    }, orgId)).toBe(false);
  });

  it('does not allow ordinary members through user management recovery when another active member exists', async () => {
    const orgId = new ObjectId();
    const memberId = new ObjectId();
    await db.collection('users').insertMany([{
      _id: memberId,
      identity: { uid: 'member-user', name: 'Member User' },
      data: {
        memberships: [{ organizationId: orgId, role: 'IndividualUser', permissions: {}, status: 'active' }]
      }
    }, {
      _id: new ObjectId(),
      identity: { uid: 'other-user', name: 'Other User' },
      data: {
        memberships: [{ organizationId: orgId, role: 'IndividualUser', permissions: {}, status: 'active' }]
      }
    }]);

    expect(await userService.canManageUsersInOrganization({
      userId: memberId.toString(),
      memberships: [{ organizationId: orgId, role: 'IndividualUser', permissions: {}, status: 'active' }]
    }, orgId)).toBe(false);
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
