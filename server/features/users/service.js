import * as usersRepository from './repository.js';
import * as sessionsRepository from '../sessions/repository.js';
import { hashPassword, verifyPassword, generateSession, generateAccessToken } from '~/server/utils/auth-helpers';
import { createError } from 'h3';
import { PERMISSION_TEMPLATES } from './permission-templates.js';
import { ObjectId } from 'mongodb';

export async function register(data, creatorUserId, creatorRole) {
  // Validate
  if (!data.email || !data.password || !data.name) {
    throw createError({ statusCode: 400, message: 'Missing required fields' });
  }
  
  // Check if email exists
  const existing = await usersRepository.findByEmail(data.email);
  if (existing) {
    throw createError({ statusCode: 409, message: 'Email already registered' });
  }
  
  // Only org admins can create users in their org, or SuperAdmin anywhere
  if (creatorRole && creatorRole !== 'SuperAdmin') {
    // TODO: verify creator is admin of target organization
    // For now we assume the caller has checked permissions via requirePermission
  }
  
  // Hash password
  const passwordHash = await hashPassword(data.password);
  
  // Get permission template
  const role = data.role || 'IndividualUser';
  const permissions = PERMISSION_TEMPLATES[role] || PERMISSION_TEMPLATES['IndividualUser'];
  
  const memberships = [];
  if (data.organizationId) {
    memberships.push({
      organizationId: new ObjectId(data.organizationId),
      role,
      permissions,
      status: 'active'
    });
  }

  return await usersRepository.create({
    email: data.email.toLowerCase(),
    passwordHash,
    name: data.name,
    organizationId: data.organizationId ? new ObjectId(data.organizationId) : null,
    role,
    permissions,
    memberships,
    currentOrganizationId: data.organizationId ? new ObjectId(data.organizationId) : null,
    restrictedTo: data.restrictedTo || null,
    isActive: true
  });
}

export async function login(email, password) {
  const user = await usersRepository.findByEmail(email.toLowerCase());
  if (!user) {
    throw createError({ statusCode: 401, message: 'Invalid credentials' });
  }
  
  if (!user.isActive) {
    throw createError({ statusCode: 403, message: 'Account deactivated' });
  }
  
  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
    throw createError({ statusCode: 401, message: 'Invalid credentials' });
  }
  
  // Generate session (separate collection)
  const session = generateSession();
  await sessionsRepository.create({
    ...session,
    userId: user._id
  });
  
  // Update last login
  await usersRepository.updateLastLogin(user._id);
  
  // Generate JWT (only contains userId)
  const accessToken = generateAccessToken(user._id);
  
  return {
    user: {
      id: user._id,
      email: user.email,
      name: user.name,
      organizationId: user.organizationId,
      role: user.role,
      permissions: user.permissions,
      memberships: user.memberships
    },
    sessionId: session.sessionId,
    accessToken
  };
}

export async function switchOrganization(userId, organizationId) {
  const user = await usersRepository.findById(userId);
  if (!user) {
    throw createError({ statusCode: 404, message: 'User not found' });
  }

  const membership = user.memberships.find(m => m.organizationId.toString() === organizationId.toString());
  if (!membership) {
    throw createError({ statusCode: 403, message: 'User is not a member of this organization' });
  }

  // Update top-level fields for backward compatibility and active session state
  const updates = {
    organizationId: membership.organizationId,
    role: membership.role,
    permissions: membership.permissions,
    currentOrganizationId: membership.organizationId
  };

  await usersRepository.updateById(userId, updates);
  return await usersRepository.findById(userId);
}

export async function logout(sessionId) {
  await sessionsRepository.deleteBySessionId(sessionId);
  return { success: true };
}

export async function getUserBySessionId(sessionId) {
  const session = await sessionsRepository.findBySessionId(sessionId);
  if (!session) return null;
  
  return await usersRepository.findById(session.userId);
}

export async function getById(id) {
  return await usersRepository.findById(id);
}

export async function list(userRole, userOrgId) {
  if (userRole === 'SuperAdmin') {
    return await usersRepository.find();
  }
  
  // Others see users that have a membership in their org
  return await usersRepository.find({ 
    "memberships.organizationId": new ObjectId(userOrgId) 
  });
}

export async function confirmMembership(userId, organizationId, action, updaterUser) {
  // Only org admins can confirm memberships
  if (updaterUser.role !== 'SuperAdmin' && updaterUser.organizationId.toString() !== organizationId.toString()) {
    throw createError({ statusCode: 403, message: 'Forbidden' });
  }

  const user = await usersRepository.findById(userId);
  if (!user) throw createError({ statusCode: 404, message: 'User not found' });

  if (action === 'approve') {
    // Set membership status to active
    const db = await (await import('~/server/db/mongo')).connectDB();
    await db.collection('users').updateOne(
      { _id: new ObjectId(userId), "memberships.organizationId": new ObjectId(organizationId) },
      { $set: { "memberships.$.status": 'active' } }
    );
  } else {
    // Remove membership
    const db = await (await import('~/server/db/mongo')).connectDB();
    await db.collection('users').updateOne(
      { _id: new ObjectId(userId) },
      { $pull: { memberships: { organizationId: new ObjectId(organizationId) } } }
    );
  }
  return { success: true };
}

export async function updatePermissions(userId, newPermissions, updaterId, updaterRole, organizationId) {
  // 1. Fetch user
  const user = await usersRepository.findById(userId);
  if (!user) throw createError({ statusCode: 404, message: 'User not found' });

  // 2. Authorization check
  // Only SuperAdmin or Admin of the same organization can update permissions
  const isSuperAdmin = updaterRole === 'SuperAdmin';
  const isInSameOrg = user.memberships?.some(m => m.organizationId.toString() === organizationId.toString());
  const isAdminOfOrg = updaterRole.endsWith('Admin') && isInSameOrg;

  if (!isSuperAdmin && !isAdminOfOrg) {
    throw createError({ statusCode: 403, message: 'Forbidden: Insufficient privileges to update permissions' });
  }

  // 3. Prepare updates
  const updates = {};
  
  // If we are updating within the current organization context
  if (organizationId && isInSameOrg) {
    // Update both top-level (for active session) and membership (for persistence)
    updates.permissions = newPermissions;

    // Use native driver for deep array update
    const db = await (await import('~/server/db/mongo')).connectDB();
    await db.collection('users').updateOne(
      { 
        _id: new ObjectId(userId), 
        "memberships.organizationId": new ObjectId(organizationId) 
      },
      { 
        $set: { 
          "memberships.$.permissions": newPermissions,
          "permissions": newPermissions // Sync active session perms
        } 
      }
    );
  } else if (isSuperAdmin) {
    // SuperAdmin can update top-level directly
    updates.permissions = newPermissions;
    await usersRepository.updateById(userId, updates);
  }

  return { success: true };
}