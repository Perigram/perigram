import * as repository from './repository.js';
import * as usersRepository from '../users/repository.js';
import * as organizationsRepository from '../organizations/repository.js';
import { createError } from 'h3';
import { ObjectId } from 'mongodb';
import crypto from 'node:crypto';
import { materializeRolePermissions } from '../users/permission-templates.js';
import { hasEntityAccess } from '../../core/access/service.js';
import { addStatus, initializeStatus } from '~/server/features/statuses/service';

export async function generateInvitation(organizationId, role, creatorUser) {
  const org = await organizationsRepository.findById(organizationId);
  if (!org) throw createError({ statusCode: 404, message: 'Organization not found' });

  if (!hasEntityAccess({
    entity: { lineage: { organizationId } },
    feature: 'users',
    level: 'write',
    auth: creatorUser
  })) {
    throw createError({ statusCode: 403, message: 'Forbidden' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const code = `INV-${Math.random().toString(36).substring(2, 8).toUpperCase()}`; // Keep short code as fallback
  
  const id = await repository.create({
    token,
    code,
    organizationId: new ObjectId(organizationId),
    organizationName: org.name,
    role: role || 'IndividualUser',
    roleIds: normalizeRoleIds(role),
    isActive: true,
    createdBy: creatorUser.userId
  });

  await initializeStatus('invitations', id.toString(), creatorUser.userId, 'Invitation generated');

  return { token, code };
}

export async function getByToken(token) {
  const invitation = await repository.findByToken(token);
  if (!invitation) throw createError({ statusCode: 404, message: 'Invitation not found or expired' });
  return invitation;
}

export async function joinByToken(token, user) {
  const invitation = await getByToken(token);
  return await processJoin(invitation, user);
}

export async function joinByCode(code, user) {
  const invitation = await repository.findByCode(code);
  if (!invitation) throw createError({ statusCode: 404, message: 'Invitation not found or expired' });
  return await processJoin(invitation, user);
}

async function processJoin(invitation, user) {
  if (invitation.expiresAt && new Date() > invitation.expiresAt) {
    // Log status as expired if we find it expired during access
    await addStatus('invitations', invitation._id.toString(), 'expired', 'SYSTEM', 'Detected expiration during access');
    throw createError({ statusCode: 410, message: 'Invitation expired' });
  }

  // Check if user is already a member
  const freshUser = await usersRepository.findById(user.userId);
  const alreadyMember = freshUser.data?.memberships?.some(m => m.organizationId.toString() === invitation.organizationId.toString());
  
  if (alreadyMember) {
    throw createError({ statusCode: 409, message: 'You already have a relationship with this organization' });
  }

  const role = invitation.role;
  const permissions = materializeRolePermissions(role);

  // Add membership as PENDING
  const newMembership = {
    organizationId: invitation.organizationId,
    role,
    roleIds: normalizeRoleIds(invitation.roleIds || role),
    permissions,
    status: 'pending'
  };

  await usersRepository.addMembership(user.userId, newMembership);

  // Invalidate invitation (one-time link)
  await repository.accept(invitation._id, user.userId);

  await addStatus('invitations', invitation._id.toString(), 'accepted', user.userId, 'Invitation accepted');
  
  return { success: true };
}

export async function listByOrg(organizationId) {
  return await repository.findByOrg(organizationId);
}

function normalizeRoleIds(role) {
  if (Array.isArray(role)) return role.filter(Boolean);
  if (role && String(role).startsWith('role_')) return [String(role)];
  return ['role_viewer'];
}
