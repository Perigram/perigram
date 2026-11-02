import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoClient, ObjectId } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';

const { mockedConnectDB } = vi.hoisted(() => ({
  mockedConnectDB: vi.fn()
}));

vi.mock('~/server/db/mongo', () => ({ connectDB: mockedConnectDB }));

vi.mock('~/server/features/states/service', () => ({
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
import * as usersService from '../users/service.js';

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

  async function seedOrganization(organizationId = 'org-6a05940e') {
    await db.collection('organizations').insertOne({
      _id: organizationId,
      identity: { uid: organizationId, name: 'Perigram Org' },
      data: { roles: { role_operator: { id: 'role_operator', label: 'Operator' } } }
    });
    const adminId = 'admin-user';
    await db.collection('users').insertOne({
      _id: adminId,
      identity: { uid: adminId, name: 'Admin User' },
      data: {
        memberships: [{
          organizationId,
          role: 'team-manager',
          permissions: { users: { level: 'admin' } },
          status: 'active'
        }]
      }
    });
    return {
      organizationId,
      admin: {
        userId: adminId,
        memberships: [{
          organizationId,
          role: 'team-manager',
          permissions: { users: { level: 'admin' } },
          status: 'active'
        }]
      }
    };
  }

  async function seedInvitee(userId) {
    await db.collection('users').insertOne({
      _id: userId,
      identity: { uid: userId, name: userId },
      data: { memberships: [] }
    });
  }

  it('generates and lists invitations for string organization ids through team-management recovery access', async () => {
    const organizationId = 'org-6a05940e';
    const userId = 'admin-user';
    await db.collection('organizations').insertOne({
      _id: organizationId,
      identity: { uid: organizationId, name: 'Perigram Org' },
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
    await expect(invitationsService.getPublicByToken(invitation.token)).resolves.toEqual({
      organizationName: 'Perigram Org',
      roleLabels: ['Operator'],
      expiresAt: expect.any(Date)
    });
  });

  it('denies invitation management to ordinary members when another active member exists', async () => {
    const organizationId = new ObjectId();
    const memberId = new ObjectId();
    await db.collection('organizations').insertOne({
      _id: organizationId,
      identity: { uid: organizationId.toString(), name: 'Perigram Org' },
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
      identity: { uid: organizationId, name: 'Perigram Org' },
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

  it('approves a pending membership and removes a rejected one', async () => {
    const { organizationId, admin } = await seedOrganization();
    const approvedId = 'approved-user';
    const rejectedId = 'rejected-user';
    await seedInvitee(approvedId);
    await seedInvitee(rejectedId);

    const approvedInvitation = await invitationsService.generateInvitation(
      organizationId,
      ['role_operator'],
      admin
    );
    const rejectedInvitation = await invitationsService.generateInvitation(
      organizationId,
      ['role_operator'],
      admin
    );
    await invitationsService.joinByToken(approvedInvitation.token, { userId: approvedId });
    await invitationsService.joinByToken(rejectedInvitation.token, { userId: rejectedId });

    await usersService.confirmMembership(approvedId, organizationId, 'approve', admin);
    await usersService.confirmMembership(rejectedId, organizationId, 'reject', admin);

    const approved = await db.collection('users').findOne({ _id: approvedId });
    const rejected = await db.collection('users').findOne({ _id: rejectedId });
    const organization = await db.collection('organizations').findOne({ _id: organizationId });
    expect(approved.data.memberships).toEqual([
      expect.objectContaining({ organizationId, status: 'active' })
    ]);
    expect(rejected.data.memberships).toEqual([]);
    expect(organization.data.roleAssignments[approvedId]).toBeTruthy();
    expect(organization.data.roleAssignments[rejectedId]).toBeUndefined();
  });

  it('accepts a targeted invitation into an active membership', async () => {
    const { organizationId, admin } = await seedOrganization();
    const inviteeId = 'targeted-user';
    await seedInvitee(inviteeId);

    const invitation = await invitationsService.generateInvitation(
      organizationId,
      ['role_operator'],
      admin,
      { inviteeUserId: inviteeId }
    );
    await invitationsService.respondInvitation(invitation.id, { userId: inviteeId }, 'accept');

    const invitee = await db.collection('users').findOne({ _id: inviteeId });
    const stored = await db.collection('invitations').findOne({ _id: new ObjectId(invitation.id) });
    expect(invitee.data.memberships).toEqual([
      expect.objectContaining({ organizationId, status: 'active' })
    ]);
    expect(stored.status).toBe('accepted');
    expect(stored.isActive).toBeUndefined();
  });

  it('declines a targeted invitation and ignores a duplicate response', async () => {
    const { organizationId, admin } = await seedOrganization();
    const declineId = 'declining-user';
    const acceptId = 'accepting-user';
    await seedInvitee(declineId);
    await seedInvitee(acceptId);

    const declined = await invitationsService.generateInvitation(
      organizationId,
      ['role_operator'],
      admin,
      { inviteeUserId: declineId }
    );
    await expect(invitationsService.respondInvitation(declined.id, { userId: declineId }, 'decline'))
      .resolves.toEqual({ success: true, status: 'declined' });
    expect((await db.collection('invitations').findOne({ _id: new ObjectId(declined.id) })).status)
      .toBe('declined');

    const accepted = await invitationsService.generateInvitation(
      organizationId,
      ['role_operator'],
      admin,
      { inviteeUserId: acceptId }
    );
    await invitationsService.respondInvitation(accepted.id, { userId: acceptId }, 'accept');
    await expect(invitationsService.respondInvitation(accepted.id, { userId: acceptId }, 'accept'))
      .rejects.toMatchObject({ statusCode: 404 });

    const invitee = await db.collection('users').findOne({ _id: acceptId });
    expect(invitee.data.memberships).toHaveLength(1);
  });

  it('revokes an invitation', async () => {
    const { organizationId, admin } = await seedOrganization();
    const invitation = await invitationsService.generateInvitation(organizationId, ['role_operator'], admin);
    const stored = await db.collection('invitations').findOne({ token: invitation.token });

    await invitationsService.revokeInvitation(organizationId, stored._id.toString(), admin);

    const revoked = await db.collection('invitations').findOne({ _id: stored._id });
    expect(revoked.status).toBe('revoked');
    expect(revoked.revokedAt).toBeInstanceOf(Date);
  });

  it('expires a pending invitation lazily on access', async () => {
    const { organizationId, admin } = await seedOrganization();
    const inviteeId = 'expired-user';
    await seedInvitee(inviteeId);
    const invitation = await invitationsService.generateInvitation(organizationId, ['role_operator'], admin);
    const stored = await db.collection('invitations').findOne({ token: invitation.token });
    await db.collection('invitations').updateOne(
      { _id: stored._id },
      { $set: { expiresAt: new Date(Date.now() - 1000) } }
    );

    await expect(invitationsService.joinByToken(invitation.token, { userId: inviteeId }))
      .rejects.toMatchObject({ statusCode: 410 });
    expect((await db.collection('invitations').findOne({ _id: stored._id })).status).toBe('expired');
    await expect(invitationsService.getPublicByToken(invitation.token))
      .rejects.toMatchObject({ statusCode: 410 });
  });
});
