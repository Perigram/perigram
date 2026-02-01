import * as usersRepository from './repository.js';
import * as sessionsRepository from '../sessions/repository.js';
import { hashPassword, verifyPassword, generateSession, generateAccessToken } from '~/server/utils/auth-helpers';
import { createError } from 'h3';
import { PERMISSION_TEMPLATES } from './permission-templates.js';
import { registerService } from '~/server/utils/blocks';
import { User } from './model.js';
import { statusService } from '~/server/core/machines/service';
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
    identity: { uid: `user-${ObjectId().toString().substring(0, 8)}`, name: data.name },
    params: { email: data.email.toLowerCase(), passwordHash, role, permissions, memberships }
  });

  user.applyStatus('ACTIVE', creatorUserId || 'SYSTEM', { note: 'User registered' });

  const createdRaw = await usersRepository.create(user);
  return new User(createdRaw);
}

export async function getUserBySessionId(sessionId) {
  const session = await sessionsRepository.findBySessionId(sessionId);
  if (!session) return null;
  const userRaw = await usersRepository.findById(session.userId);
  if (!userRaw) return null;
  return new User(userRaw);
}

export async function login(email, password) {
  const userRaw = await usersRepository.findByEmail(email.toLowerCase());
  if (!userRaw) throw createError({ statusCode: 401, message: 'Invalid credentials' });
  const user = new User(userRaw);
  
  if (!user.data.isActive) throw createError({ statusCode: 403, message: 'Account deactivated' });
  
  const valid = await verifyPassword(user.data.passwordHash, password);
  if (!valid) throw createError({ statusCode: 401, message: 'Invalid credentials' });
  
  const session = generateSession();
  await sessionsRepository.create({ ...session, userId: user._id });
  await usersRepository.updateLastLogin(user._id);
  const accessToken = generateAccessToken(user._id);
  
  return {
    user,
    sessionId: session.sessionId,
    accessToken
  };
}

export async function logout(sessionId) {
  return await sessionsRepository.deleteBySessionId(sessionId);
}

export async function switchOrganization(userId, organizationId) {
  // Logic to validate organization membership would go here
  // For now, return a new token with updated org context if needed
  // In v24, this might just be a client-side context switch or a session update
  return { success: true, organizationId };
}

export async function list(userId, userOrg, userRole, userPermissions) {
  const filter = userRole === 'SuperAdmin' ? {} : { "data.memberships.organizationId": userOrg };
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
  return await getById(uid);
}

export async function remove(uid, deleterId, deleterRole) {
  if (deleterRole !== 'SuperAdmin') throw createError({ statusCode: 403, message: 'Forbidden' });
  await usersRepository.deleteById(uid);
  await sessionsRepository.deleteByUserId(uid);
  return { success: true };
}
