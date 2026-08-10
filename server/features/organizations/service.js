import * as repository from './repository.js';
import { createProcessUpdateHandler } from '../_template/process-update-handler.js';
import { createError } from 'h3';
import { hasPermission, resolveAuthPermissions } from '../../utils/auth-helpers.js';
import { getLineageFilter } from '../../utils/permissions.js';
import { Organization } from './model.js';
import { statusService } from '../../core/machines/service.js';
import { ObjectId } from 'mongodb';
import { getProcessTemplate } from '~/packages/processes/src/index.js';
import * as processDefinitionsService from '../process-definitions/service.js';
import * as invitationsService from '../invitations/service.js';
import { ownerMembership } from '../users/organization-owner.js';

/**
 * Organizations Service - v24 Absolute Final
 */

export async function create(data, userId, userOrg, userRole, userPermissions) {
  if (!hasPermission({ permissions: userPermissions.effectivePermissions || userPermissions.permissions }, 'organizations', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  const processTemplateId = data.processTemplateId || 'contractor';
  const template = getProcessTemplate(processTemplateId);
  const org = new Organization({
    identity: { uid: `org-${new ObjectId().toString().substring(0, 8)}`, name: data.name || 'New Organization' },
    data: {
      type: data.type || 'Customer',
      email: data.email || '',
      phone: data.phone || '',
      address: data.address || '',
      settings: data.settings || {},
      roles: structuredClone(template.organizationRoles),
      roleAssignments: {
        [String(userId)]: { userId: String(userId), roleIds: ['role_admin'], bindings: {} }
      }
    }
  });

  org.applyStatus('ACTIVE', userId, { note: 'Organization created' });

  const createdRaw = await repository.create(org);
  await processDefinitionsService.createActiveFromTemplate({
    organizationId: createdRaw._id,
    templateId: processTemplateId,
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

  const processTemplateId = data.processTemplateId || 'contractor';
  const template = getProcessTemplate(processTemplateId);
  const org = new Organization({
    identity: { uid: `org-${new ObjectId().toString().substring(0, 8)}`, name: data.name },
    data: {
      processTemplateId,
      email: data.email || '',
      phone: data.phone || '',
      address: data.address || '',
      settings: data.settings || {},
      roles: structuredClone(template.organizationRoles),
      roleAssignments: {
        [String(userId)]: { userId: String(userId), roleIds: ['role_admin'], bindings: {} }
      }
    }
  });

  org.applyStatus('ACTIVE', userId, { note: 'Organization created during signup' });

  const createdRaw = await repository.create(org);
  await processDefinitionsService.createActiveFromTemplate({
    organizationId: createdRaw._id,
    templateId: processTemplateId,
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

export async function list(userId, userOrg, userRole, userPermissions, filter = {}) {
  const finalFilter = { ...filter, ...getLineageFilter(userPermissions) };
  const raws = await repository.find(finalFilter);
  return raws.map(raw => new Organization(raw));
}

export async function update(uid, updates, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(uid);
  if (!raw) throw createError({ statusCode: 404, message: 'Organization not found' });
  const org = new Organization(raw);
  
  if (!hasPermission({ permissions: resolveAuthPermissions(userPermissions) }, 'organizations', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  if (updates.name) org.identity.name = updates.name;
  org.data = { ...org.data, ...(updates.data || {}) };

  await repository.updateById(uid, org);
  const updatedRaw = await repository.findById(uid);
  return new Organization(updatedRaw);
}

export async function remove(uid, userId, userOrg, userRole, userPermissions) {
  if (!hasPermission({ permissions: resolveAuthPermissions(userPermissions) }, 'organizations', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  return await repository.deleteById(uid);
}

export async function getByIds(ids) {
  if (!ids || ids.length === 0) return [];
  const raws = await repository.findByIds(ids);
  return raws.map(raw => new Organization(raw).toJSON());
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
  org.data.roles[id] = { id, label };
  await repository.updateById(organizationId, org);
  return org.data.roles[id];
}

export async function updateRole(organizationId, roleId, payload = {}, auth = {}) {
  const org = await loadManagedOrganization(organizationId, auth, 'admin');
  if (!org.data.roles[roleId]) throw createError({ statusCode: 404, message: 'Organization role not found' });
  const label = normalizeRoleLabel(payload.label);
  assertUniqueRoleLabel(org.data.roles, label, roleId);
  org.data.roles[roleId] = { id: roleId, label };
  await repository.updateById(organizationId, org);
  return org.data.roles[roleId];
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
  entityType: 'organization',
  repository,
  Model: Organization
});
