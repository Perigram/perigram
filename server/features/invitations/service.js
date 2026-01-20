import * as repository from './repository.js';
import * as usersRepository from '../users/repository.js';
import { createError } from 'h3';
import { ObjectId } from 'mongodb';
import { PERMISSION_TEMPLATES } from '../users/permission-templates.js';

export async function generateInvitation(organizationId, role, creatorUser) {
  // Only org admins can generate invitations
  if (creatorUser.role !== 'SuperAdmin' && creatorUser.organizationId.toString() !== organizationId.toString()) {
    throw createError({ statusCode: 403, message: 'Forbidden' });
  }

  const code = `INV-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  
  await repository.create({
    code,
    organizationId: new ObjectId(organizationId),
    role: role || 'IndividualUser',
    isActive: true,
    createdBy: creatorUser.userId
  });

  return { code };
}

export async function joinByCode(code, user) {
  const invitation = await repository.findByCode(code);
  
  if (!invitation) {
    throw createError({ statusCode: 404, message: 'Invalid or expired invitation code' });
  }

  if (new Date() > invitation.expiresAt) {
    throw createError({ statusCode: 410, message: 'Invitation code expired' });
  }

  // Check if user is already a member
  const freshUser = await usersRepository.findById(user.userId);
  const alreadyMember = freshUser.memberships?.some(m => m.organizationId.toString() === invitation.organizationId.toString());
  
  if (alreadyMember) {
    throw createError({ statusCode: 409, message: 'You are already a member of this organization' });
  }

  const role = invitation.role;
  const permissions = PERMISSION_TEMPLATES[role] || PERMISSION_TEMPLATES.IndividualUser;

  // Add membership
  const newMembership = {
    organizationId: invitation.organizationId,
    role,
    permissions
  };

  const updates = {
    $push: { memberships: newMembership }
  };

  // If user has no current organization, set this as primary
  if (!freshUser.currentOrganizationId) {
    updates.$set = {
      organizationId: invitation.organizationId,
      role,
      permissions,
      currentOrganizationId: invitation.organizationId
    };
  }

  const db = await (await import('~/server/db/mongo')).connectDB();
  await db.collection('users').updateOne(
    { _id: new ObjectId(user.userId) },
    updates
  );

  // Mark invitation as used (if single-use, but here we can keep it simple or make it multi-use)
  // For now, let's keep it active for 7 days for multiple people if needed, or implement usage count
  
  return { success: true };
}
