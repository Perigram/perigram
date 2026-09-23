import * as usersRepository from './repository.js';
import * as sessionsRepository from '../sessions/repository.js';
import { createProcessUpdateHandler } from '../_template/process-update-handler.js';
import { hashPassword, verifyPassword, generateSession, generateAccessToken } from '../../utils/auth-helpers.js';
import { createError } from 'h3';
import { User } from './model.js';
import { stateService } from '../../core/machines/service.js';
import { toFlexibleId } from '../../utils/objectid.js';
import { ObjectId } from 'mongodb';
import { hasInstanceAccess } from '../../core/access/service.js';
import * as organizationsRepository from '../organizations/repository.js';
import { hasPermissionGrant } from '#shared/access-control.js';
import { ensureOwnerMembership, isOwnerMembership, mergeOwnerPermissions } from './organization-owner.js';
import * as filesService from '../files/service.js';

/**
 * Users Service - v24 Absolute Final
 */


export async function register(data, creatorUserId, userOrg, creatorRole, creatorPermissions) {
  if (!data.email || !data.password || !data.name) {
    throw createError({ statusCode: 400, message: 'Missing required fields' });
  }
  
  try {
    const existing = await usersRepository.findByEmail(data.email.toLowerCase());
    if (existing) throw createError({ statusCode: 409, message: 'Email already registered' });
    const organization = data.organizationId ? await organizationsRepository.findById(data.organizationId) : null;
    const roleIds = [...new Set(Array.isArray(data.roleIds) ? data.roleIds : [])];
    if (data.organizationId && !organization) throw createError({ statusCode: 404, message: 'Organization not found' });
    const missingRoleIds = roleIds.filter(roleId => !organization?.data?.roles?.[roleId]);
    if (missingRoleIds.length) throw createError({ statusCode: 400, message: `Unknown organization roles: ${missingRoleIds.join(', ')}` });
    
    const passwordHash = await hashPassword(data.password);
    const memberships = [];
    if (data.organizationId) {
      memberships.push({
        organizationId: data.organizationId,
        permissions: {},
        status: 'active'
      });
    }

    const user = new User({
      identity: { uid: `user-${new ObjectId().toString().substring(0, 8)}`, name: data.name },
      data: {
        email: data.email.toLowerCase(),
        passwordHash,
        memberships,
        isActive: true
      }
    });

    user.applyStatus('ACTIVE', creatorUserId || 'SYSTEM', { note: 'User registered' });

    const createdRaw = await usersRepository.create(user);
    if (data.organizationId) {
      await organizationsRepository.setRoleAssignment(data.organizationId, createdRaw._id, {
        userId: String(createdRaw._id), roleIds, bindings: data.bindings || {}
      });
    }
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
  user.data.permissions = membership.owner ? mergeOwnerPermissions(membership.permissions || {}) : membership.permissions;

  await usersRepository.updateById(userId, user);
  return await getById(userId);
}

export async function confirmMembership(userId, organizationId, action, updaterUser) {
  if (!await canManageUsersInOrganization(updaterUser, organizationId)) {
    throw createError({ statusCode: 403, message: 'Forbidden' });
  }

  const userRaw = await usersRepository.findById(userId);
  if (!userRaw) throw createError({ statusCode: 404, message: 'User not found' });

  if (action === 'approve') {
    await usersRepository.setMembershipStatus(userId, organizationId, 'active');
  } else {
    await assertCanRemoveMembership({ userId, organizationId });
    await usersRepository.removeMembership(userId, organizationId);
    await organizationsRepository.removeRoleAssignment(organizationId, userId);
  }
  return { success: true };
}

export async function updatePermissions(userId, newPermissions, updaterAuth = {}) {
  const userRaw = await usersRepository.findById(userId);
  if (!userRaw) throw createError({ statusCode: 404, message: 'User not found' });

  const targetOrgId = getActiveOrganizationId(updaterAuth);
  const isInSameOrg = targetOrgId && userRaw.data.memberships?.some(m => m.organizationId.toString() === targetOrgId.toString());

  if (!targetOrgId || !isInSameOrg || !await canManageUsersInOrganization(updaterAuth, targetOrgId)) {
    throw createError({ statusCode: 403, message: 'Forbidden' });
  }

  const membership = userRaw.data.memberships?.find(item => item.organizationId?.toString() === targetOrgId.toString());
  const permissions = membership?.owner ? mergeOwnerPermissions(newPermissions || {}) : newPermissions;
  await usersRepository.updateMembershipPermissions(userId, targetOrgId, permissions);
  return { success: true };
}

export async function list(userId, userOrg, userRole, userPermissions) {
  const auth = normalizeAuthFromArgs(userId, userOrg, userRole, userPermissions);
  const orgIds = uniqueIdValues([
    ...(auth.memberships || []).flatMap(membership => lookupIdValues(membership.organizationId)),
    ...lookupIdValues(auth.organizationId)
  ]);
  const filter = { "data.memberships.organizationId": { $in: orgIds } };
  const raws = await usersRepository.find(filter);
  return raws.map(raw => new User(raw));
}

export async function getById(uid) {
  const raw = await usersRepository.findById(uid);
  if (!raw) return null;
  return new User(raw);
}

export async function saveAvatar(uid, file = {}, auth = {}) {
  const raw = await usersRepository.findById(uid);
  if (!raw) throw createError({ statusCode: 404, message: 'User not found' });
  await assertCanEditUserAvatar(raw, auth);
  if (!file.buffer?.length) throw createError({ statusCode: 400, message: 'Avatar image is required' });
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimeType)) {
    throw createError({ statusCode: 400, message: 'Avatar must be a JPEG, PNG, or WebP image' });
  }
  if (file.buffer.length > 5 * 1024 * 1024) {
    throw createError({ statusCode: 413, message: 'Avatar image must not exceed 5 MB' });
  }

  const uploaded = await filesService.uploadFile(
    file.buffer,
    `avatar-${uid}-${Date.now()}`,
    { userId: String(uid), mimeType: file.mimeType },
    'avatars'
  );
  const previousFileId = raw.data?.avatar?.fileId;
  const updatedAt = new Date();
  const updatedRaw = await usersRepository.updateAvatar(uid, {
    fileId: uploaded.id,
    mimeType: file.mimeType,
    updatedAt
  });
  if (previousFileId) await filesService.deleteFile(previousFileId, 'avatars');
  return new User(updatedRaw);
}

export async function getAvatar(uid, auth = {}) {
  const raw = await usersRepository.findById(uid);
  if (!raw) throw createError({ statusCode: 404, message: 'User not found' });
  // Avatars are shared profile chrome, not private data: they render beside
  // every message in cross-organization support/admin conversations, so any
  // authenticated caller may read them. Editing stays restricted below.
  const avatar = raw.data?.avatar;
  if (!avatar?.fileId) throw createError({ statusCode: 404, message: 'Avatar not found' });
  return {
    stream: await filesService.getFileStream(avatar.fileId, 'avatars'),
    mimeType: avatar.mimeType || 'image/jpeg'
  };
}

export async function removeAvatar(uid, auth = {}) {
  const raw = await usersRepository.findById(uid);
  if (!raw) throw createError({ statusCode: 404, message: 'User not found' });
  await assertCanEditUserAvatar(raw, auth);
  const fileId = raw.data?.avatar?.fileId;
  await usersRepository.updateAvatar(uid, null);
  if (fileId) await filesService.deleteFile(fileId, 'avatars');
  return { success: true };
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

export const processUpdate = createProcessUpdateHandler({
  typeId: 'user',
  repository: usersRepository,
  Model: User
});

export async function remove(uid, deleterAuth = {}) {
  const userRaw = await usersRepository.findById(uid);
  if (!userRaw) throw createError({ statusCode: 404, message: 'User not found' });

  const targetOrgId = getActiveOrganizationId(deleterAuth);
  const isInSameOrg = targetOrgId && userRaw.data.memberships?.some(m => m.organizationId.toString() === targetOrgId.toString());

  if (!targetOrgId || !isInSameOrg || !await canManageUsersInOrganization(deleterAuth, targetOrgId)) {
    throw createError({ statusCode: 403, message: 'Forbidden' });
  }

  await assertCanRemoveMembership({ userId: uid, organizationId: targetOrgId });
  await usersRepository.removeMembership(uid, targetOrgId);
  return { success: true };
}

function getActiveOrganizationId(auth = {}) {
  return auth.organizationId || auth.memberships?.[0]?.organizationId || null;
}

async function assertCanEditUserAvatar(userRaw, auth = {}) {
  if (String(userRaw._id) === String(auth.userId)) return;
  const organizationId = getActiveOrganizationId(auth);
  const inOrganization = userRaw.data?.memberships?.some(item => (
    String(item.organizationId) === String(organizationId)
  ));
  if (inOrganization && await canManageUsersInOrganization(auth, organizationId)) return;
  throw createError({ statusCode: 403, message: 'Forbidden' });
}

function assertCanReadUser(userRaw, auth = {}) {
  if (String(userRaw._id) === String(auth.userId)) return;
  const organizationIds = new Set([
    auth.organizationId,
    ...(auth.memberships || []).map(item => item.organizationId)
  ].filter(Boolean).map(String));
  if (userRaw.data?.memberships?.some(item => organizationIds.has(String(item.organizationId)))) return;
  throw createError({ statusCode: 403, message: 'Forbidden' });
}

function lookupIdValues(value) {
  if (!value) return [];
  const flexible = toFlexibleId(value);
  const stringValue = value?.toString?.() || value;
  return [flexible, stringValue].filter(Boolean);
}

function uniqueIdValues(values) {
  const seen = new Set();
  return values.filter(value => {
    const key = `${value?.constructor?.name || typeof value}:${value?.toString?.() || value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function canManageUsersInOrganization(auth = {}, organizationId) {
  if (!organizationId) return false;
  if (hasInstanceAccess({
    entity: { lineage: { organizationId } },
    feature: 'users',
    level: 'admin',
    auth
  })) return true;

  const membership = findOrganizationMembership(auth, organizationId);
  if (!membership || membership.status === 'pending' || membership.status === 'rejected') return false;
  if (membership.owner === true) return true;
  if (hasPermissionGrant({ permissions: membership.permissions || {}, feature: 'users', level: 'admin' })) return true;
  return false;
}

function normalizeAuthFromArgs(userId, organizationId, role, auth = {}) {
  return {
    ...auth,
    userId: auth.userId || userId,
    organizationId: auth.organizationId || organizationId,
    memberships: auth.memberships || []
  };
}

function findOrganizationMembership(auth = {}, organizationId) {
  const target = organizationId?.toString();
  const membership = (auth.memberships || []).find(item => item.organizationId?.toString() === target);
  return membership ? ensureOwnerMembership(membership) : null;
}

async function assertCanRemoveMembership({ userId, organizationId } = {}) {
  const targetRaw = await usersRepository.findById(userId);
  const targetMembership = targetRaw?.data?.memberships?.find(item => item.organizationId?.toString() === organizationId?.toString());
  if (!targetMembership || ['pending', 'rejected'].includes(targetMembership.status)) return;

  const activeMembers = await usersRepository.findActiveMembersByOrganization(organizationId);
  if (activeMembers.length <= 1) {
    throw createError({ statusCode: 409, message: 'Organization must have at least one active user' });
  }

  if (!isOwnerMembership(targetMembership)) return;
  const activeOwners = await usersRepository.findActiveOwnersByOrganization(organizationId);
  if (activeOwners.length <= 1) {
    throw createError({ statusCode: 409, message: 'Organization must have at least one owner admin' });
  }
}
