import * as usersRepository from './repository.js';
import * as sessionsRepository from '../sessions/repository.js';
import { hashPassword, verifyPassword, generateSession, generateAccessToken } from '../../utils/auth-helpers.js';
import { createError } from 'h3';
import { User } from './model.js';
import { toFlexibleId } from '../../utils/objectid.js';
import { ObjectId } from 'mongodb';
import { hasInstanceAccess } from '../../core/access/service.js';
import * as organizationsRepository from '../organizations/repository.js';
import { hasPermissionGrant } from '#shared/access-control.js';
import { ensureOwnerMembership, isOwnerMembership, mergeOwnerPermissions } from './organization-owner.js';
import * as filesService from '../files/service.js';


export async function register(data, auth = {}) {
  if (!data.email || !data.password || !data.name) {
    throw createError({ statusCode: 400, message: 'Missing required fields' });
  }
  
  try {
    const existing = await usersRepository.findByEmail(data.email.toLowerCase());
    if (existing) throw createError({ statusCode: 409, message: 'Email already registered' });
    if (data.organizationId && !await canManageUsersInOrganization(auth, data.organizationId)) {
      throw createError({ statusCode: 403, message: 'Forbidden' });
    }
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
      identity: { uid: `user-${new ObjectId().toString()}`, name: data.name },
      data: {
        email: data.email.toLowerCase(),
        passwordHash,
        memberships
      }
    });

    user.applyStatus('ACTIVE', auth.userId || 'SYSTEM', { note: 'User registered' });

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

/**
 * Bot members are users: no password (no login), an internal placeholder
 * email, a bot marker with the hashed token, and a membership carrying the
 * narrow `organizations` recovery grant that opens process definition
 * management (and nothing else). Process roles ride the organization's role
 * assignment like any member's. `email` is normally derived from the minted
 * uid; the org assistant passes its deterministic per-org address instead,
 * which makes assistant bootstrap idempotent across workers (the 409
 * collision means it already exists).
 */
/**
 * Registers the bot-marker member (see the users README for the marker).
 * Today the only bot member is the organization assistant — the AI
 * attribution identity — whose deterministic per-org address makes
 * bootstrap idempotent across workers (a 409 collision means it already
 * exists). The marker carries no token and no profile; the assistant
 * takes no process roles: AI runs execute delegated to the chatting
 * user (SPEC: agent access).
 */
export async function registerBot({ name, organizationId, email = null } = {}, creatorUserId = 'SYSTEM') {
  if (!name || !organizationId) {
    throw createError({ statusCode: 400, message: 'Bot name and organization are required' });
  }
  const organization = await organizationsRepository.findById(organizationId);
  if (!organization) throw createError({ statusCode: 404, message: 'Organization not found' });
  const uid = `user-${new ObjectId().toString()}`;
  const botEmail = String(email || `${uid}@bots.perigram.internal`).toLowerCase();
  const existing = await usersRepository.findByEmail(botEmail);
  if (existing) throw createError({ statusCode: 409, message: 'Bot identity collision, retry' });
  const user = new User({
    identity: { uid, name },
    data: {
      email: botEmail,
      memberships: [{
        organizationId,
        permissions: { organizations: 'admin' },
        status: 'active'
      }],
      bot: { createdAt: new Date() }
    }
  });
  user.applyStatus('ACTIVE', creatorUserId, { note: 'Bot member created' });
  const createdRaw = await usersRepository.create(user);
  return { user: new User(createdRaw) };
}

/**
 * The canonical pre-process auth context the auth middleware populates —
 * exported so server-side actors (the agent bot runtime) build the same
 * shape the request path does before `resolveProcessAuth` widens it.
 */
export function buildAuthContext(user) {
  const userDto = user.toJSON();
  const allMemberships = user.memberships || [];
  const memberships = allMemberships.filter(membership => (
    !membership.status || membership.status === 'active'
  ));
  const currentOrganizationId = user.organizationId?.toString() || null;
  const activeMembership = memberships.find(membership => (
    membership.organizationId?.toString?.() === currentOrganizationId
  )) || memberships[0] || null;
  return {
    userId: user.id,
    name: user.identity?.name || '',
    email: user.data?.email || '',
    avatarUrl: userDto.data?.avatarUrl || null,
    // Membership state is authoritative: a stale lineage pointer cannot
    // keep a removed/pending tenant active in a still-valid login session.
    organizationId: activeMembership?.organizationId?.toString?.() || null,
    role: user.role,
    // Stored user-level permissions are a stale tenant snapshot, never a
    // platform grant. Without an active membership there are no tenant grants.
    permissions: activeMembership?.permissions || {},
    memberships,
    restrictedTo: user.restrictedTo
  };
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
  if (!membership) {
    throw createError({ statusCode: 403, message: 'User is not a member of this organization' });
  }
  if (membership.status && membership.status !== 'active') {
    throw createError({ statusCode: 403, message: 'User membership is not active in this organization' });
  }

  user.lineage.organizationId = toFlexibleId(organizationId);
  user.data.permissions = membership.owner ? mergeOwnerPermissions(membership.permissions || {}) : membership.permissions;

  await usersRepository.updateById(userId, user);
  return await getById(userId);
}

export async function leaveOrganization(userId, organizationId) {
  const user = await getById(userId);
  if (!user) throw createError({ statusCode: 404, message: 'User not found' });

  const target = String(organizationId || '');
  const membership = (user.memberships || []).find(item => String(item.organizationId) === target);
  if (!membership) throw createError({ statusCode: 404, message: 'Membership not found' });

  await assertCanRemoveMembership({ userId, organizationId: target });
  await usersRepository.removeMembership(userId, target);
  await organizationsRepository.removeRoleAssignment(target, userId);

  if (String(user.organizationId || '') === target) {
    const next = (user.memberships || []).find(item => (
      String(item.organizationId) !== target
      && (!item.status || item.status === 'active')
    ));
    const permissions = next
      ? (next.owner ? mergeOwnerPermissions(next.permissions || {}) : next.permissions || {})
      : {};
    await usersRepository.setActiveOrganization(userId, next?.organizationId || null, permissions);
  }

  return { success: true };
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

export async function list(auth = {}) {
  const orgIds = uniqueIdValues([
    ...(auth.memberships || []).flatMap(membership => lookupIdValues(membership.organizationId)),
    ...lookupIdValues(auth.organizationId)
  ]);
  const filter = { "data.memberships.organizationId": { $in: orgIds } };
  const raws = await usersRepository.find(filter);
  return raws.map(raw => new User(raw));
}

// Directory discovery: matches active users by
// display name only, never email, and is consumed exclusively by the
// directory feature for cross-tenant search cards.
export async function directorySearch(query, limit = 10) {
  const raws = await usersRepository.searchByName(query, limit);
  return raws.map(raw => new User(raw));
}

export async function getById(uid) {
  const raw = await usersRepository.findById(uid);
  if (!raw) return null;
  return new User(raw);
}

export async function findUserByEmail(email) {
  const raw = await usersRepository.findByEmail(String(email || '').toLowerCase());
  return raw ? new User(raw) : null;
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
  const membership = findOrganizationMembership(auth, organizationId);
  // A compiled grant must not outlive an explicitly inactive tenant
  // membership (e.g. a stale server-side auth object).
  if (membership?.status && membership.status !== 'active') return false;
  if (hasInstanceAccess({
    entity: { lineage: { organizationId } },
    feature: 'users',
    level: 'admin',
    auth
  })) return true;

  if (!membership) return false;
  if (membership.owner === true) return true;
  if (hasPermissionGrant({ permissions: membership.permissions || {}, feature: 'users', level: 'admin' })) return true;
  return false;
}

function findOrganizationMembership(auth = {}, organizationId) {
  const target = organizationId?.toString();
  const membership = (auth.memberships || []).find(item => item.organizationId?.toString() === target);
  return membership ? ensureOwnerMembership(membership) : null;
}

async function assertCanRemoveMembership({ userId, organizationId } = {}) {
  const targetRaw = await usersRepository.findById(userId);
  const targetMembership = targetRaw?.data?.memberships?.find(item => item.organizationId?.toString() === organizationId?.toString());
  if (!targetMembership || targetMembership.status !== 'active') return;

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
