import * as usersRepository from './repository.js';
import * as sessionsRepository from '../sessions/repository.js';
import { hashPassword, verifyPassword, generateSession, generateAccessToken } from '~/server/utils/auth-helpers';
import { createError } from 'h3';
import { PERMISSION_TEMPLATES } from './permission-templates.js';

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
  
  return await usersRepository.create({
    email: data.email.toLowerCase(),
    passwordHash,
    name: data.name,
    organizationId: data.organizationId,
    role,
    permissions,
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
      permissions: user.permissions
    },
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
  
  return await usersRepository.findById(session.userId);
}

export async function getById(id) {
  return await usersRepository.findById(id);
}

export async function list(userRole, userOrgId) {
  if (userRole === 'SuperAdmin') {
    return await usersRepository.find();
  }
  
  // Others see only users in their org
  return await usersRepository.find({ organizationId: userOrgId });
}

export async function updatePermissions(userId, permissions, updaterUserId, updaterRole, updaterOrgId) {
  const user = await usersRepository.findById(userId);
  if (!user) {
    throw createError({ statusCode: 404, message: 'User not found' });
  }
  
  // Only org admins can update permissions in their org, or SuperAdmin
  if (updaterRole !== 'SuperAdmin' && user.organizationId.toString() !== updaterOrgId.toString()) {
    throw createError({ statusCode: 403, message: 'Cannot update users from other organizations' });
  }
  
  const success = await usersRepository.updateById(userId, { permissions });
  if (!success) {
    throw createError({ statusCode: 500, message: 'Update failed' });
  }
  
  return await usersRepository.findById(userId);
}