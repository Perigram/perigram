import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoClient, ObjectId } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';

const { mockedConnectDB } = vi.hoisted(() => ({
  mockedConnectDB: vi.fn()
}));

vi.mock('~/server/db/mongo', () => ({ connectDB: mockedConnectDB }));

vi.mock('~/server/features/statuses/service', () => ({
  initializeStatus: vi.fn(),
  addStatus: vi.fn()
}));

vi.mock('h3', () => ({
  createError: vi.fn((err) => {
    const error = new Error(err.message);
    error.statusCode = err.statusCode;
    return error;
  })
}));

import * as invitationsService from './service.js';

describe('invitations', () => {
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
    await db.collection('invitations').deleteMany({});
  });

  it('generates and lists invitations for string organization ids through team-management recovery access', async () => {
    const organizationId = 'org-6a05940e';
    const userId = 'admin-user';
    await db.collection('organizations').insertOne({
      _id: organizationId,
      identity: { uid: organizationId, name: 'Cutkit Org' },
      data: { roles: { role_operator: { id: 'role_operator', label: 'Operator' } } }
    });
    await db.collection('users').insertOne({
      _id: userId,
      identity: { uid: userId, name: 'Admin User' },
      data: {
        memberships: [{ organizationId, role: 'team-manager', permissions: { users: { level: 'admin' } }, status: 'active' }]
      }
    });

    const invitation = await invitationsService.generateInvitation(organizationId, ['role_operator'], {
      userId,
      memberships: [{ organizationId, role: 'team-manager', permissions: { users: { level: 'admin' } }, status: 'active' }]
    });
    const rows = await invitationsService.listByOrgForUser(organizationId, {
      userId,
      memberships: [{ organizationId, role: 'team-manager', permissions: { users: { level: 'admin' } }, status: 'active' }]
    });

    expect(invitation.token).toBeTruthy();
    expect(rows).toHaveLength(1);
    expect(rows[0].organizationId).toBe(organizationId);
    expect(rows[0].roleIds).toEqual(['role_operator']);
  });

  it('denies invitation management to ordinary members when another active member exists', async () => {
    const organizationId = new ObjectId();
    const memberId = new ObjectId();
    await db.collection('organizations').insertOne({
      _id: organizationId,
      identity: { uid: organizationId.toString(), name: 'Cutkit Org' },
      data: { roles: { role_viewer: { id: 'role_viewer', label: 'Viewer' } } }
    });
    await db.collection('users').insertMany([{
      _id: memberId,
      identity: { uid: memberId.toString(), name: 'Member User' },
      data: {
        memberships: [{ organizationId, role: 'role_viewer', permissions: {}, status: 'active' }]
      }
    }, {
      _id: new ObjectId(),
      identity: { uid: 'other-user', name: 'Other User' },
      data: {
        memberships: [{ organizationId, role: 'role_viewer', permissions: {}, status: 'active' }]
      }
    }]);

    await expect(invitationsService.listByOrgForUser(organizationId, {
      userId: memberId.toString(),
      memberships: [{ organizationId, role: 'role_viewer', permissions: {}, status: 'active' }]
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  it('accepts invitations with multiple process roles without materializing membership permissions', async () => {
    const organizationId = 'org-6a05940e';
    const creatorId = 'admin-user';
    const invitedUserId = 'invited-user';
    await db.collection('organizations').insertOne({
      _id: organizationId,
      identity: { uid: organizationId, name: 'Cutkit Org' },
      data: { roles: {
        role_operator: { id: 'role_operator', label: 'Operator' },
        role_reviewer: { id: 'role_reviewer', label: 'Reviewer' }
      } }
    });
    await db.collection('users').insertMany([{
      _id: creatorId,
      identity: { uid: creatorId, name: 'Admin User' },
      data: {
        memberships: [{ organizationId, role: 'team-manager', permissions: { users: { level: 'admin' } }, status: 'active' }]
      }
    }, {
      _id: invitedUserId,
      identity: { uid: invitedUserId, name: 'Invited User' },
      data: {
        memberships: []
      }
    }]);

    const invitation = await invitationsService.generateInvitation(organizationId, ['role_operator', 'role_reviewer'], {
      userId: creatorId,
      memberships: [{ organizationId, role: 'team-manager', permissions: { users: { level: 'admin' } }, status: 'active' }]
    });

    await invitationsService.joinByToken(invitation.token, { userId: invitedUserId });

    const user = await db.collection('users').findOne({ _id: invitedUserId });
    expect(user.data.memberships[0]).toMatchObject({
      organizationId,
      permissions: {},
      status: 'pending'
    });
    const organization = await db.collection('organizations').findOne({ _id: organizationId });
    expect(organization.data.roleAssignments[invitedUserId]).toEqual({
      userId: invitedUserId,
      roleIds: ['role_operator', 'role_reviewer'],
      bindings: {}
    });
  });
});
