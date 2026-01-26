import * as usersRepository from './repository.js';
import * as sessionsRepository from '../sessions/repository.js';
import { hashPassword, verifyPassword, generateSession, generateAccessToken } from '~/server/utils/auth-helpers';
import { createError } from 'h3';
import { PERMISSION_TEMPLATES } from './permission-templates.js';
import { ObjectId } from 'mongodb';

export async function register(data, creatorUserId, userOrg, creatorRole, creatorPermissions) {
  if (!data.email || !data.password || !data.name) {
    throw createError({ statusCode: 400, message: 'Missing required fields' });
  }
  
  const existing = await usersRepository.findByEmail(data.email.toLowerCase());
  if (existing) {
    throw createError({ statusCode: 409, message: 'Email already registered' });
  }
  
  const passwordHash = await hashPassword(data.password);
  const role = data.role || 'IndividualUser';
  const permissions = PERMISSION_TEMPLATES[role] || PERMISSION_TEMPLATES['IndividualUser'];
  
  // Update permissions for IndividualUser if not already set robustly
  if (role === 'IndividualUser') {
      permissions.requisitions = 'admin';
      permissions.catalogs = 'read';
  }

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
  if (!user) throw createError({ statusCode: 401, message: 'Invalid credentials' });
  if (!user.isActive) throw createError({ statusCode: 403, message: 'Account deactivated' });
  
  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) throw createError({ statusCode: 401, message: 'Invalid credentials' });
  
  const session = generateSession();
  await sessionsRepository.create({ ...session, userId: user._id });
  await usersRepository.updateLastLogin(user._id);
  const accessToken = generateAccessToken(user._id);
  
  return {
    user: {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      organizationId: user.organizationId?.toString(),
      role: user.role,
      permissions: user.permissions,
      memberships: user.memberships || []
    },
    sessionId: session.sessionId,
    accessToken
  };
}

export async function list(userId, userOrg, userRole, userPermissions) {
  if (userRole === 'SuperAdmin') return await usersRepository.find();
  return await usersRepository.find({ 
    "memberships.organizationId": new ObjectId(userOrg) 
  });
}

export async function switchOrganization(userId, organizationId) {
  const user = await usersRepository.findById(userId);
  if (!user) throw createError({ statusCode: 404, message: 'User not found' });

  const membership = user.memberships.find(m => m.organizationId.toString() === organizationId.toString());
  if (!membership) throw createError({ statusCode: 403, message: 'User is not a member of this organization' });

  const updates = {
    organizationId: membership.organizationId,
    role: membership.role,
    permissions: membership.permissions,
    currentOrganizationId: membership.organizationId
  };

  await usersRepository.updateById(userId, updates);
  return await usersRepository.findById(userId);
}

export async function confirmMembership(userId, organizationId, action, updaterUser) {
  if (updaterUser.role !== 'SuperAdmin' && updaterUser.organizationId?.toString() !== organizationId.toString()) {
    throw createError({ statusCode: 403, message: 'Forbidden' });
  }

  const user = await usersRepository.findById(userId);
  if (!user) throw createError({ statusCode: 404, message: 'User not found' });

  const db = await (await import('~/server/db/mongo')).connectDB();
  if (action === 'approve') {
    await db.collection('users').updateOne(
      { _id: new ObjectId(userId), "memberships.organizationId": new ObjectId(organizationId) },
      { $set: { "memberships.$.status": 'active' } }
    );
  } else {
    await db.collection('users').updateOne(
      { _id: new ObjectId(userId) },
      { $pull: { memberships: { organizationId: new ObjectId(organizationId) } } }
    );
  }
  return { success: true };
}

export async function updatePermissions(userId, newPermissions, deleterId, userOrg, deleterRole, userPermissions) {
  const user = await usersRepository.findById(userId);
  if (!user) throw createError({ statusCode: 404, message: 'User not found' });

  const isSuperAdmin = deleterRole === 'SuperAdmin';
  const isInSameOrg = user.memberships?.some(m => m.organizationId.toString() === userOrg?.toString());
  const isAdminOfOrg = deleterRole.endsWith('Admin') && isInSameOrg;

  if (!isSuperAdmin && !isAdminOfOrg) {
    throw createError({ statusCode: 403, message: 'Forbidden' });
  }

  if (userOrg && isInSameOrg) {
    const db = await (await import('~/server/db/mongo')).connectDB();
    await db.collection('users').updateOne(
      { _id: new ObjectId(userId), "memberships.organizationId": new ObjectId(userOrg) },
      { $set: { "memberships.$.permissions": newPermissions, "permissions": newPermissions } }
    );
  } else if (isSuperAdmin) {
    await usersRepository.updateById(userId, { permissions: newPermissions });
  }

  return { success: true };
}

export async function remove(userId, deleterId, userOrg, deleterRole, userPermissions) {
  const user = await usersRepository.findById(userId);
  if (!user) throw createError({ statusCode: 404, message: 'User not found' });

  const isSuperAdmin = deleterRole === 'SuperAdmin';
  const isInSameOrg = userOrg && user.memberships?.some(m => m.organizationId.toString() === userOrg.toString());
  const isAdminOfOrg = deleterRole.endsWith('Admin') && isInSameOrg;

  if (!isSuperAdmin && !isAdminOfOrg) {
    throw createError({ statusCode: 403, message: 'Forbidden' });
  }

  if (isSuperAdmin) {
    await usersRepository.deleteById(userId);
    await sessionsRepository.deleteByUserId(userId);
  } else {
    const db = await (await import('~/server/db/mongo')).connectDB();
    await db.collection('users').updateOne(
      { _id: new ObjectId(userId) },
      { $pull: { memberships: { organizationId: new ObjectId(userOrg) } } }
    );
  }

  return { success: true };
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