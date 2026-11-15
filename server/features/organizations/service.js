import * as repository from './repository.js';
import { createProcessUpdateHandler } from '../_template/process-update-handler.js';
import { createError } from 'h3';
import { hasPermission, resolveAuthPermissions } from '../../utils/auth-helpers.js';
import { getLineageFilter } from '../../utils/permissions.js';
import { Organization } from './model.js';
import { ObjectId } from 'mongodb';
import * as processDefinitionsService from '../process-definitions/service.js';
import * as invitationsService from '../invitations/service.js';
import { ownerMembership } from '../users/organization-owner.js';


export async function create(data, auth = {}) {
  const { userId } = auth;
  // Bootstrap grant: an account without any organization creates its first
  // one here (registration no longer creates organizations); the created
  // owner membership is what unlocks tenant permissions afterwards.
  const memberships = auth?.memberships || [];
  const isBootstrap = !auth?.organizationId && !memberships.length;
  const permissions = resolveAuthPermissions(auth);
  if (!isBootstrap && !hasPermission({ permissions }, 'organizations', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  const org = new Organization({
    identity: { uid: `org-${new ObjectId().toString().substring(0, 8)}`, name: data.name || 'New Organization' },
    data: {
      type: data.type || 'Customer',
      email: data.email || '',
      phone: data.phone || '',
      address: data.address || '',
      settings: data.settings || {},
      roles: { role_admin: { id: 'role_admin', label: 'Admin' } },
      roleAssignments: {
        [String(userId)]: { userId: String(userId), roleIds: ['role_admin'], bindings: {} }
      }
    }
  });

  org.applyStatus('ACTIVE', userId, { note: 'Organization created' });

  const createdRaw = await repository.create(org);
  await processDefinitionsService.createActiveEmptyProcess({
    organizationId: createdRaw._id,
    actorId: userId
  });

  const membership = ownerMembership({
    organizationId: createdRaw._id,
  });

  await repository.addUserMembership(userId, membership, { organizationId: createdRaw._id });

  return new Organization(createdRaw);
}

export async function createInitialForUser(userId, data = {}) {
  if (!userId) throw createError({ statusCode: 400, message: 'Missing user id' });
  if (!data.name) throw createError({ statusCode: 400, message: 'Missing organization name' });

  const org = new Organization({
    identity: { uid: `org-${new ObjectId().toString().substring(0, 8)}`, name: data.name },
    data: {
      email: data.email || '',
      phone: data.phone || '',
      address: data.address || '',
      settings: data.settings || {},
      roles: { role_admin: { id: 'role_admin', label: 'Admin' } },
      roleAssignments: {
        [String(userId)]: { userId: String(userId), roleIds: ['role_admin'], bindings: {} }
      }
    }
  });

  org.applyStatus('ACTIVE', userId, { note: 'Organization created during signup' });

  const createdRaw = await repository.create(org);
  await processDefinitionsService.createActiveEmptyProcess({
    organizationId: createdRaw._id,
    actorId: userId
  });

  await repository.addUserMembership(userId, ownerMembership({
    organizationId: createdRaw._id
  }), { organizationId: createdRaw._id });

  return new Organization(createdRaw);
}

export async function getById(uid) {
  const raw = await repository.findById(uid);
  if (!raw) return null;
  return new Organization(raw);
}

/**
 * Authenticated organization detail reads use the same active-tenant and
 * feature-permission gate as settings and mutations. Directory cards use
 * getById directly because they intentionally expose a smaller cross-tenant
 * projection rather than the organization record.
 */
export async function getManagedById(organizationId, auth = {}) {
  return await loadManagedOrganization(organizationId, auth, 'read');
}

export async function list(auth = {}, filter = {}) {
  const finalFilter = { ...filter, ...getLineageFilter(auth) };
  const raws = await repository.find(finalFilter);
  return raws.map(raw => new Organization(raw));
}

// Directory discovery: matches organizations by
// name across tenants and is consumed exclusively by the directory feature
// for search cards; ordinary list queries stay membership-scoped.
export async function directorySearch(query, limit = 10) {
  const raws = await repository.searchByName(query, limit);
  return raws.map(raw => new Organization(raw));
}

export async function update(uid, updates, auth = {}) {
  const org = await loadManagedOrganization(uid, auth, 'write');

  if (updates.name) org.identity.name = updates.name;
  org.data = { ...org.data, ...(updates.data || {}) };

  await repository.updateById(uid, org);
  const updatedRaw = await repository.findById(uid);
  return new Organization(updatedRaw);
}

/**
 * Section-scoped settings writes for capability modules (transcription,
 * llm, meetings): the generic update merges `data` shallowly, which would
 * clobber sibling settings sections — this merges one key under
 * `data.settings` and nothing else. `readSettingsSection` is the gated
 * read twin.
 */
export async function readSettingsSection(organizationId, section, auth = {}) {
  const org = await loadManagedOrganization(organizationId, auth, 'read');
  const value = org.data?.settings?.[section];
  return value && typeof value === 'object' ? value : (value ?? null);
}

export async function updateSettingsSection(organizationId, section, value, auth = {}) {
  const org = await loadManagedOrganization(organizationId, auth, 'write');
  org.data.settings = { ...(org.data.settings || {}), [section]: value };
  await repository.updateById(organizationId, org);
  return org.data.settings[section];
}

export async function remove(uid, auth = {}) {
  await loadManagedOrganization(uid, auth, 'admin');
  return await repository.deleteById(uid);
}

export async function getByIds(ids) {
  if (!ids || ids.length === 0) return [];
  const raws = await repository.findByIds(ids);
  return raws.map(raw => new Organization(raw).toJSON());
}

// Process runtime integration is exposed through the registered organization
// service so process features never reach into this feature's repository.
export async function getProcessConfiguration(organizationId) {
  const raw = await repository.findById(organizationId);
  if (!raw) return null;
  return {
    roles: structuredClone(raw.data?.roles || {}),
    roleAssignments: structuredClone(raw.data?.roleAssignments || {})
  };
}

export async function listRoles(organizationId, auth = {}) {
  const org = await loadManagedOrganization(organizationId, auth, 'read');
  return org.data.roles;
}

export async function createRole(organizationId, payload = {}, auth = {}) {
  const org = await loadManagedOrganization(organizationId, auth, 'admin');
  const label = normalizeRoleLabel(payload.label);
  assertUniqueRoleLabel(org.data.roles, label);
  const id = `role_${new ObjectId().toString().slice(0, 12)}`;
  org.data.roles[id] = { id, label, ...normalizeFlag('exclusive', payload.exclusive), ...normalizeFlag('agentChat', payload.agentChat) };
  await repository.updateById(organizationId, org);
  return org.data.roles[id];
}

export async function updateRole(organizationId, roleId, payload = {}, auth = {}) {
  const org = await loadManagedOrganization(organizationId, auth, 'admin');
  if (!org.data.roles[roleId]) throw createError({ statusCode: 404, message: 'Organization role not found' });
  const current = org.data.roles[roleId];
  const exclusive = payload.exclusive === undefined
    ? (current.exclusive ? { exclusive: true } : {})
    : normalizeFlag('exclusive', payload.exclusive);
  if (exclusive.exclusive && !current.exclusive) {
    const holders = Object.values(org.data.roleAssignments)
      .filter(item => item.roleIds?.includes(roleId))
      .map(item => item.userId);
    if (holders.length > 1) {
      throw createError({
        statusCode: 409,
        message: 'Single-seat role is currently held by more than one member',
        data: { holders }
      });
    }
  }
  const agentChat = payload.agentChat === undefined
    ? (current.agentChat ? { agentChat: true } : {})
    : normalizeFlag('agentChat', payload.agentChat);
  const label = normalizeRoleLabel(payload.label ?? current.label);
  assertUniqueRoleLabel(org.data.roles, label, roleId);
  org.data.roles[roleId] = { id: roleId, label, ...exclusive, ...agentChat };
  await repository.updateById(organizationId, org);
  return org.data.roles[roleId];
}

function normalizeFlag(name, value) {
  return value ? { [name]: true } : {};
}

/**
 * The agent-chat capability (SPEC: agent access): a member sees and
 * addresses the organization AI when any of their assigned roles carries
 * `agentChat`. No roles assigned or no flagged role means no AI surface.
 */
export async function canUseAgentChats(organizationId, userId) {
  if (!organizationId || !userId) return false;
  const raw = await repository.findById(organizationId);
  const roles = raw?.data?.roles || {};
  const roleIds = raw?.data?.roleAssignments?.[String(userId)]?.roleIds || [];
  return roleIds.some(roleId => roles[String(roleId)]?.agentChat);
}

export async function deleteRole(organizationId, roleId, auth = {}) {
  const org = await loadManagedOrganization(organizationId, auth, 'admin');
  if (!org.data.roles[roleId]) throw createError({ statusCode: 404, message: 'Organization role not found' });
  const assignments = Object.values(org.data.roleAssignments).filter(item => item.roleIds?.includes(roleId));
  const [invitations, processes] = await Promise.all([
    invitationsService.findRoleReferences(organizationId, roleId),
    processDefinitionsService.findRoleReferences(organizationId, roleId)
  ]);
  if (assignments.length || invitations.length || processes.length) {
    throw createError({
      statusCode: 409,
      message: 'Organization role is still referenced',
      data: { assignments: assignments.map(item => item.userId), invitations, processes }
    });
  }
  delete org.data.roles[roleId];
  await repository.updateById(organizationId, org);
  return { success: true };
}

export async function listRoleAssignments(organizationId, auth = {}) {
  const org = await loadManagedOrganization(organizationId, auth, 'read');
  return org.data.roleAssignments;
}

export async function updateRoleAssignment(organizationId, userId, payload = {}, auth = {}) {
  const org = await loadManagedOrganization(organizationId, auth, 'admin');
  const roleIds = [...new Set(Array.isArray(payload.roleIds) ? payload.roleIds : [])];
  const missing = roleIds.filter(roleId => !org.data.roles[roleId]);
  if (missing.length) throw createError({ statusCode: 400, message: `Unknown organization roles: ${missing.join(', ')}` });
  const assignment = {
    userId: String(userId),
    roleIds,
    bindings: payload.bindings && typeof payload.bindings === 'object' ? payload.bindings : {}
  };
  await repository.setRoleAssignment(organizationId, userId, assignment);
  return assignment;
}

async function loadManagedOrganization(organizationId, auth, level) {
  if (String(auth.organizationId || '') !== String(organizationId)) {
    throw createError({ statusCode: 403, message: 'Organization membership is required' });
  }
  if (!hasPermission({ permissions: resolveAuthPermissions(auth) }, 'organizations', level)) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  const raw = await repository.findById(organizationId);
  if (!raw) throw createError({ statusCode: 404, message: 'Organization not found' });
  return new Organization(raw);
}

function normalizeRoleLabel(label) {
  const normalized = String(label || '').trim();
  if (!normalized) throw createError({ statusCode: 400, message: 'Role label is required' });
  return normalized;
}

function assertUniqueRoleLabel(roles, label, exceptRoleId = null) {
  const duplicate = Object.entries(roles).some(([roleId, role]) => roleId !== exceptRoleId && role.label.toLowerCase() === label.toLowerCase());
  if (duplicate) throw createError({ statusCode: 409, message: 'Role label already exists' });
}

export const processUpdate = createProcessUpdateHandler({
  typeId: 'organization',
  repository,
  Model: Organization
});
