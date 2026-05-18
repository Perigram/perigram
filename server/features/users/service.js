import * as usersRepository from './repository.js';
import * as sessionsRepository from '../sessions/repository.js';
import { hashPassword, verifyPassword, generateSession, generateAccessToken } from '../../utils/auth-helpers.js';
import { createError } from 'h3';
import { PERMISSION_TEMPLATES } from './permission-templates.js';
import { registerService } from '~/server/core/blocks/index.js';
import { User } from './model.js';
import { statusService } from '../../core/machines/service.js';
import { toFlexibleId } from '../../utils/objectid.js';
import { connectDB } from '../../db/mongo.js';
import { ObjectId } from 'mongodb';

/**
 * Users Service - v24 Absolute Final
 */

registerService('user', {
  getById: (uid) => getById(uid)
});

export async function register(data, creatorUserId, userOrg, creatorRole, creatorPermissions) {
  if (!data.email || !data.password || !data.name) {
    throw createError({ statusCode: 400, message: 'Missing required fields' });
  }
  
  try {
    const existing = await usersRepository.findByEmail(data.email.toLowerCase());
    if (existing) throw createError({ statusCode: 409, message: 'Email already registered' });
    
    const passwordHash = await hashPassword(data.password);
    const role = data.role || 'IndividualUser';
    const permissions = PERMISSION_TEMPLATES[role] || PERMISSION_TEMPLATES['IndividualUser'];
    
    const memberships = [];
    if (data.organizationId) {
      memberships.push({
        organizationId: data.organizationId,
        role,
        permissions,
        status: 'active'
      });
    }

    const user = new User({
      identity: { uid: `user-${new ObjectId().toString().substring(0, 8)}`, name: data.name },
      data: {
        email: data.email.toLowerCase(),
        passwordHash,
        role,
        permissions,
        memberships,
        isActive: true
      }
    });

    user.applyStatus('ACTIVE', creatorUserId || 'SYSTEM', { note: 'User registered' });

    const createdRaw = await usersRepository.create(user);
    return new User(createdRaw);
  } catch (err) {
    console.error('[AUTH] Registration error:', err);
    if (err.statusCode) throw err;
    throw createError({ statusCode: 500, message: `Registration failed: ${err.message}` });
  }
}

export async function login(email, password) {
  const normalizedEmail = email.trim().toLowerCase();
  const userRaw = await usersRepository.findByEmail(normalizedEmail);
  
  if (!userRaw) {
    throw createError({ 
      statusCode: 401, 
      message: `Invalid credentials (User not found: ${normalizedEmail})` 
    });
  }
  
  const user = new User(userRaw);
  if (!user.isActive) throw createError({ statusCode: 403, message: 'Account deactivated' });
  
  const valid = await verifyPassword(user.data.passwordHash, password);
  
  if (!valid) {
    throw createError({ 
      statusCode: 401, 
      message: `Invalid credentials` 
    });
  }
  
  const session = generateSession();
  await sessionsRepository.create({ ...session, userId: user.id });
  await usersRepository.updateLastLogin(user.id);
  const accessToken = generateAccessToken(user.id);
  
  return {
    user,
    sessionId: session.sessionId,
    accessToken
  };
}

export async function logout(sessionId) {
  await sessionsRepository.deleteBySessionId(sessionId);
  return { success: true };
}

export async function getUserBySessionId(sessionId) {
  const session = await sessionsRepository.findBySessionId(sessionId);
  if (!session) return null;
  const userRaw = await usersRepository.findById(session.userId);
  if (!userRaw) return null;
  return new User(userRaw);
}

export async function switchOrganization(userId, organizationId) {
  const user = await getById(userId);
  if (!user) throw createError({ statusCode: 404, message: 'User not found' });

  const membership = user.memberships.find(m => m.organizationId.toString() === organizationId.toString());
  if (!membership) throw createError({ statusCode: 403, message: 'User is not a member of this organization' });

  user.lineage.organizationId = toFlexibleId(organizationId);
  user.data.role = membership.role;
  user.data.permissions = membership.permissions;

  await usersRepository.updateById(userId, user);
  return await getById(userId);
}

export async function confirmMembership(userId, organizationId, action, updaterUser) {
  if (updaterUser.role !== 'SuperAdmin' && updaterUser.organizationId?.toString() !== organizationId.toString()) {
    throw createError({ statusCode: 403, message: 'Forbidden' });
  }

  const userRaw = await usersRepository.findById(userId);
  if (!userRaw) throw createError({ statusCode: 404, message: 'User not found' });

  const db = await connectDB();
  if (action === 'approve') {
    await db.collection('users').updateOne(
      { _id: toFlexibleId(userId), "data.memberships.organizationId": organizationId },
      { $set: { "data.memberships.$.status": 'active' } }
    );
  } else {
    await db.collection('users').updateOne(
      { _id: toFlexibleId(userId) },
      { $pull: { "data.memberships": { organizationId: organizationId } } }
    );
  }
  return { success: true };
}

export async function updatePermissions(userId, newPermissions, deleterId, userOrg, deleterRole, userPermissions) {
  const userRaw = await usersRepository.findById(userId);
  if (!userRaw) throw createError({ statusCode: 404, message: 'User not found' });

  const isSuperAdmin = deleterRole === 'SuperAdmin';
  const isInSameOrg = userRaw.data.memberships?.some(m => m.organizationId.toString() === userOrg?.toString());
  const isAdminOfOrg = deleterRole.endsWith('Admin') && isInSameOrg;

  if (!isSuperAdmin && !isAdminOfOrg) {
    throw createError({ statusCode: 403, message: 'Forbidden' });
  }

  const db = await connectDB();
  if (userOrg && isInSameOrg) {
    await db.collection('users').updateOne(
      { _id: toFlexibleId(userId), "data.memberships.organizationId": userOrg },
      { $set: { "data.memberships.$.permissions": newPermissions, "data.permissions": newPermissions } }
    );
  } else if (isSuperAdmin) {
    await db.collection('users').updateOne(
        { _id: toFlexibleId(userId) },
        { $set: { "data.permissions": newPermissions } }
    );
  }

  return { success: true };
}

export async function list(userId, userOrg, userRole, userPermissions) {
  const filter = userRole === 'SuperAdmin' ? {} : { "data.memberships.organizationId": toFlexibleId(userOrg) };
  const raws = await usersRepository.find(filter);
  return raws.map(raw => new User(raw));
}

export async function getById(uid) {
  const raw = await usersRepository.findById(uid);
  if (!raw) return null;
  return new User(raw);
}

export async function update(uid, updates, userId, userRole) {
  const raw = await usersRepository.findById(uid);
  if (!raw) throw createError({ statusCode: 404, message: 'User not found' });
  const user = new User(raw);

  if (updates.name) user.identity.name = updates.name;
  user.data = { ...user.data, ...(updates.data || {}) };

  await usersRepository.updateById(uid, user);
  const updatedRaw = await usersRepository.findById(uid);
  return new User(updatedRaw);
}

export async function remove(uid, deleterId, userOrg, deleterRole, userPermissions) {
  const userRaw = await usersRepository.findById(uid);
  if (!userRaw) throw createError({ statusCode: 404, message: 'User not found' });

  const isSuperAdmin = deleterRole === 'SuperAdmin';
  const isInSameOrg = userOrg && userRaw.data.memberships?.some(m => m.organizationId.toString() === userOrg.toString());
  const isAdminOfOrg = deleterRole.endsWith('Admin') && isInSameOrg;

  if (!isSuperAdmin && !isAdminOfOrg) {
    throw createError({ statusCode: 403, message: 'Forbidden' });
  }

  if (isSuperAdmin) {
    await usersRepository.deleteById(uid);
    await sessionsRepository.deleteByUserId(uid);
  } else {
    const db = await connectDB();
    await db.collection('users').updateOne(
      { _id: toFlexibleId(uid) },
      { $pull: { "data.memberships": { organizationId: userOrg } } }
    );
  }

  return { success: true };
}
