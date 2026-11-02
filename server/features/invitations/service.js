import * as repository from './repository.js';
import * as usersRepository from '../users/repository.js';
import * as organizationsRepository from '../organizations/repository.js';
import { createError } from 'h3';
import crypto from 'node:crypto';
import { canManageUsersInOrganization } from '../users/service.js';
import { addStatus, initializeStatus } from '~/server/features/states/service';
import { toFlexibleId } from '~/server/utils/objectid.js';

export async function generateInvitation(organizationId, roleIds, creatorUser, options = {}) {
  const org = await organizationsRepository.findById(organizationId);
  if (!org) throw createError({ statusCode: 404, message: 'Organization not found' });
  await assertCanManageInvitations(organizationId, creatorUser);

  const token = crypto.randomBytes(32).toString('hex');
  const code = `INV-${Math.random().toString(36).substring(2, 8).toUpperCase()}`; // Keep short code as fallback
  const invitedRoleIds = normalizeRoleIds(roleIds);
  if (!invitedRoleIds.length) throw createError({ statusCode: 400, message: 'Invitation requires at least one organization role' });
  const missing = invitedRoleIds.filter(roleId => !org.data?.roles?.[roleId]);
  if (missing.length) throw createError({ statusCode: 400, message: `Unknown organization roles: ${missing.join(', ')}` });

  // Targeted invitations address one existing user and complete in a single
  // handshake: the invitee accepts from their profile and becomes an active
  // member (see README). Link invitations stay unaddressed.
  let inviteeUserId = null;
  if (options.inviteeUserId) {
    inviteeUserId = String(options.inviteeUserId);
    const invitee = await usersRepository.findById(inviteeUserId);
    if (!invitee) throw createError({ statusCode: 404, message: 'Invited user not found' });
    const alreadyMember = (invitee.data?.memberships || []).some(m =>
      m.organizationId.toString() === organizationId.toString()
    );
    if (alreadyMember) {
      throw createError({ statusCode: 409, message: 'User is already a member of this organization' });
    }
    const existingInvite = await repository.findActiveByInviteeAndOrganization(inviteeUserId, organizationId);
    if (existingInvite) {
      throw createError({ statusCode: 409, message: 'User already has a pending invitation' });
    }
  }

  const id = await repository.create({
    token,
    code,
    organizationId: toFlexibleId(organizationId),
    organizationName: org.identity?.name || org.name || '',
    roleIds: invitedRoleIds,
    status: 'pending',
    createdBy: creatorUser.userId,
    ...(inviteeUserId ? { inviteeUserId } : {})
  });

  await initializeStatus('invitations', id.toString(), creatorUser.userId, 'Invitation generated');

  return inviteeUserId ? { id: id.toString(), targeted: true } : { token, code };
}

export async function getByToken(token) {
  return await requirePendingInvitation(await repository.findByToken(token));
}

async function requirePendingInvitation(invitation, actor = 'SYSTEM') {
  if (!invitation) throw createError({ statusCode: 404, message: 'Invitation not found or expired' });
  if (!repository.isPendingStatus(invitation.status)) {
    throw createError({
      statusCode: invitation.status === 'expired' ? 410 : 404,
      message: 'Invitation not found or expired'
    });
  }
  if (invitation.expiresAt && new Date() > new Date(invitation.expiresAt)) {
    await expireInvitation(invitation, actor);
    throw createError({ statusCode: 410, message: 'Invitation expired' });
  }
  return invitation;
}

async function expireInvitation(invitation, actor = 'SYSTEM') {
  const expired = await repository.setStatus(invitation._id, 'expired', actor, { expiredAt: new Date() });
  if (expired) {
    await addStatus('invitations', invitation._id.toString(), 'expired', 'SYSTEM', 'Detected expiration during access');
  }
}

export async function getPublicByToken(token) {
  const invitation = await getByToken(token);
  const organization = await organizationsRepository.findById(invitation.organizationId);
  const roles = organization?.data?.roles || {};
  return {
    organizationName: invitation.organizationName || organization?.identity?.name || '',
    roleLabels: normalizeRoleIds(invitation.roleIds).map(roleId => roles[roleId]?.label || roleId),
    expiresAt: invitation.expiresAt || null
  };
}

export async function joinByToken(token, user) {
  const invitation = await getByToken(token);
  return await processJoin(invitation, user);
}

export async function joinByCode(code, user) {
  const invitation = await requirePendingInvitation(await repository.findByCode(code));
  return await processJoin(invitation, user);
}

async function processJoin(invitation, user) {
  // Check if user is already a member
  const freshUser = await usersRepository.findById(user.userId);
  const alreadyMember = freshUser.data?.memberships?.some(m => m.organizationId.toString() === invitation.organizationId.toString());
  
  if (alreadyMember) {
    throw createError({ statusCode: 409, message: 'You already have a relationship with this organization' });
  }

  const invitedRoleIds = normalizeRoleIds(invitation.roleIds);
  if (!invitedRoleIds.length) throw createError({ statusCode: 400, message: 'Invitation has no organization role' });

  // Add membership as PENDING
  const newMembership = {
    organizationId: invitation.organizationId,
    permissions: {},
    status: 'pending'
  };

  await usersRepository.addMembership(user.userId, newMembership);

  const organization = await organizationsRepository.findById(invitation.organizationId);
  if (!organization) throw createError({ statusCode: 404, message: 'Organization not found' });
  await organizationsRepository.setRoleAssignment(invitation.organizationId, user.userId, {
    userId: String(user.userId),
    roleIds: invitedRoleIds,
    bindings: {}
  });

  // Invalidate invitation (one-time link)
  await repository.accept(invitation._id, user.userId);

  await addStatus('invitations', invitation._id.toString(), 'accepted', user.userId, 'Invitation accepted');
  
  return { success: true };
}

export async function listByOrgForUser(organizationId, auth = {}) {
  await assertCanManageInvitations(organizationId, auth);
  const invitations = await repository.findByOrg(organizationId);
  return Promise.all(invitations.map(invitation => serializeForOrganization(invitation)));
}

export async function listMine(user) {
  if (!user?.userId) throw createError({ statusCode: 401, message: 'Unauthorized' });
  const invitations = await repository.findActiveByInvitee(user.userId);
  return Promise.all(invitations.map(invitation => serializeForInvitee(invitation)));
}

export async function respondInvitation(invitationId, user, action = 'accept') {
  if (!user?.userId) throw createError({ statusCode: 401, message: 'Unauthorized' });
  const invitation = await requirePendingInvitation(await repository.findById(invitationId), user.userId);
  if (String(invitation.inviteeUserId || '') !== String(user.userId)) {
    throw createError({ statusCode: 403, message: 'Invitation is not addressed to you' });
  }

  if (action === 'decline') {
    const declined = await repository.setStatus(invitation._id, 'declined', user.userId, { declinedAt: new Date() });
    if (!declined) throw createError({ statusCode: 404, message: 'Invitation not found or expired' });
    await addStatus('invitations', invitation._id.toString(), 'declined', user.userId, 'Invitation declined');
    return { success: true, status: 'declined' };
  }

  const freshUser = await usersRepository.findById(user.userId);
  const alreadyMember = (freshUser.data?.memberships || []).some(m =>
    m.organizationId.toString() === invitation.organizationId.toString()
  );
  if (alreadyMember) {
    throw createError({ statusCode: 409, message: 'You already have a relationship with this organization' });
  }

  const invitedRoleIds = normalizeRoleIds(invitation.roleIds);
  const organization = await organizationsRepository.findById(invitation.organizationId);
  if (!organization) throw createError({ statusCode: 404, message: 'Organization not found' });

  // Single handshake: the invitation was created by a team administrator who
  // already chose this user, so accepting creates the active membership
  // directly — no second organizational approval round.
  await usersRepository.addMembership(user.userId, {
    organizationId: invitation.organizationId,
    permissions: {},
    status: 'active'
  });
  await organizationsRepository.setRoleAssignment(invitation.organizationId, user.userId, {
    userId: String(user.userId),
    roleIds: invitedRoleIds,
    bindings: {}
  });
  await repository.accept(invitation._id, user.userId);
  await addStatus('invitations', invitation._id.toString(), 'accepted', user.userId, 'Invitation accepted');

  return { success: true, status: 'accepted' };
}

async function serializeForOrganization(invitation) {
  const base = {
    _id: invitation._id.toString(),
    organizationId: String(invitation.organizationId),
    code: invitation.code,
    token: invitation.token,
    roleIds: normalizeRoleIds(invitation.roleIds),
    status: invitation.status,
    createdAt: invitation.createdAt,
    expiresAt: invitation.expiresAt,
    inviteeUserId: invitation.inviteeUserId ? String(invitation.inviteeUserId) : null
  };
  if (!invitation.inviteeUserId) return base;
  const invitee = await usersRepository.findById(invitation.inviteeUserId);
  return {
    ...base,
    inviteeName: invitee?.identity?.name || null
  };
}

async function serializeForInvitee(invitation) {
  const organization = await organizationsRepository.findById(invitation.organizationId);
  const roles = organization?.data?.roles || {};
  return {
    _id: invitation._id.toString(),
    organizationId: invitation.organizationId.toString(),
    organizationName: invitation.organizationName || organization?.identity?.name || '',
    roleLabels: normalizeRoleIds(invitation.roleIds).map(roleId => roles[roleId]?.label || roleId),
    status: invitation.status,
    createdAt: invitation.createdAt,
    expiresAt: invitation.expiresAt || null
  };
}

export async function revokeInvitation(organizationId, invitationId, auth = {}) {
  await assertCanManageInvitations(organizationId, auth);
  const invitation = await requirePendingInvitation(await repository.findById(invitationId), auth.userId);
  await repository.revoke(invitation._id, auth.userId);
  return { success: true };
}

export async function findRoleReferences(organizationId, roleId) {
  const invitations = await repository.findByOrg(organizationId);
  return invitations
    .filter(invitation => (invitation.roleIds || []).includes(roleId))
    .map(invitation => ({ id: String(invitation._id), code: invitation.code }));
}

async function assertCanManageInvitations(organizationId, auth = {}) {
  if (!await canManageUsersInOrganization(auth, organizationId)) {
    throw createError({ statusCode: 403, message: 'Forbidden' });
  }
}

function normalizeRoleIds(role) {
  if (Array.isArray(role)) return role.filter(Boolean);
  return [];
}
