import { createError } from 'h3';
import standardSlugify from 'standard-slugify';
import { ObjectId } from 'mongodb';
import { assertEntityAccess } from '~/server/core/access/service.js';
import { createStatusState } from '~/server/core/blocks/index.js';
import * as organizationsRepository from '~/server/features/organizations/repository.js';
import * as usersRepository from '~/server/features/users/repository.js';
import {
  compileProcessDefinition,
  createProcessFromTemplate,
  hasCanonicalProcessSource,
  normalizeProcessDefinition,
  validateProcessDefinition,
  validateRoundTrip
} from '~/packages/processes/src/index.js';
import { getCutkitRegistry } from '~/server/runtime/cutkit-registry.js';
import { toFlexibleId } from '~/server/utils/objectid.js';
import { ProcessDefinition } from './model.js';
import * as repository from './repository.js';

export async function list(auth) {
  const organizationId = resolveOrganizationId(auth);
  await assertOrgAccess(auth, organizationId, 'read');
  const raws = await repository.find({ 'lineage.organizationId': toFlexibleId(organizationId) });
  return raws.map(raw => new ProcessDefinition(raw).toJSON());
}

export async function getActive(auth) {
  const organizationId = resolveOrganizationId(auth);
  await assertOrgAccess(auth, organizationId, 'read');
  const raw = await repository.findActiveByOrganization(organizationId);
  return raw ? new ProcessDefinition(raw).toJSON() : null;
}

export async function getById(id, auth) {
  const process = await loadAuthorized(id, auth, 'read');
  return process.toJSON();
}

export async function create(payload = {}, auth) {
  const organizationId = payload.organizationId || resolveOrganizationId(auth);
  await assertOrgAccess(auth, organizationId, 'write');
  const name = payload.name || payload.identity?.name || 'Organization process';
  const process = new ProcessDefinition({
    identity: {
      uid: `process-${new ObjectId().toString().slice(0, 8)}`,
      name,
      slug: standardSlugify(name, { keepCase: false })
    },
    lineage: { organizationId: toFlexibleId(organizationId) },
    data: normalizeProcessDefinition(payload.data || payload)
  });
  applyProcessStatus(process, 'DRAFT', auth.userId, 'Process draft created');
  const created = await repository.create(process);
  return new ProcessDefinition(created).toJSON();
}

export async function update(id, payload = {}, auth) {
  const process = await loadAuthorized(id, auth, 'write');
  if (process.status?.state?.primary === 'ACTIVE') {
    throw createError({ statusCode: 409, message: 'Active process definitions cannot be edited directly' });
  }
  if (payload.identity?.name || payload.name) {
    process.identity.name = payload.identity?.name || payload.name;
  }
  process.data = {
    ...process.data,
    ...normalizeProcessDefinition(payload.data || payload)
  };
  process.data.compiled = null;
  const updated = await repository.updateById(id, process);
  return new ProcessDefinition(updated).toJSON();
}

export async function validate(id, auth) {
  const process = await loadAuthorized(id, auth, 'write');
  assertCanonicalProcessSource(process.data);
  return validateProcessDefinition(process.data, getDomain());
}

export async function activate(id, auth) {
  const process = await loadAuthorized(id, auth, 'admin');
  assertCanonicalProcessSource(process.data);
  const validation = validateProcessDefinition(process.data, getDomain());
  if (!validation.ok) {
    throw createError({ statusCode: 400, message: validation.errors.join('; '), data: validation });
  }
  const roundTrip = validateRoundTrip(process.data);
  if (!roundTrip.ok) {
    throw createError({ statusCode: 400, message: roundTrip.errors.join('; '), data: roundTrip });
  }
  process.data = {
    ...process.data,
    compiled: compileProcessDefinition(process.data, getDomain())
  };
  await repository.archiveActiveByOrganization(process.lineage.organizationId, auth.userId);
  applyProcessStatus(process, 'ACTIVE', auth.userId, 'Process activated');
  const updated = await repository.updateById(id, process);
  await organizationsRepository.updateById(process.lineage.organizationId, {
    data: {
      ...(await organizationsRepository.findById(process.lineage.organizationId))?.data,
      activeProcessDefinitionId: updated._id
    }
  });
  return new ProcessDefinition(updated).toJSON();
}

export async function createActiveFromTemplate({ organizationId, userId, templateId, actorId } = {}) {
  if (!organizationId) throw createError({ statusCode: 400, message: 'Organization id is required' });

  const process = new ProcessDefinition(createProcessFromTemplate({
    templateId,
    organizationId: toFlexibleId(organizationId),
    userId
  }));

  const validation = validateProcessDefinition(process.data, getDomain());
  if (!validation.ok) {
    throw createError({ statusCode: 400, message: validation.errors.join('; '), data: validation });
  }

  process.data = {
    ...process.data,
    compiled: compileProcessDefinition(process.data, getDomain())
  };
  applyProcessStatus(process, 'ACTIVE', actorId || userId || 'SYSTEM', 'Process activated from starter template');

  await repository.archiveActiveByOrganization(organizationId, actorId || userId || 'SYSTEM');
  const created = await repository.create(process);
  await organizationsRepository.updateById(organizationId, {
    data: {
      ...(await organizationsRepository.findById(organizationId))?.data,
      activeProcessDefinitionId: created._id
    }
  });

  return new ProcessDefinition(created).toJSON();
}

export async function assignUserToActiveProcess({ userId, roleIds = [], bindings = {}, status = 'active' } = {}, auth = {}) {
  const organizationId = resolveOrganizationId(auth);
  await assertOrgAccess(auth, organizationId, 'admin');
  return await assignUserToActiveProcessInternal({
    organizationId,
    userId,
    roleIds,
    bindings,
    status,
    actorId: auth.userId
  });
}

export async function assignUserToActiveProcessInternal({
  organizationId,
  userId,
  roleIds = [],
  bindings = {},
  status = 'active',
  actorId = 'SYSTEM'
} = {}) {
  if (!organizationId) throw createError({ statusCode: 400, message: 'Organization id is required' });
  if (!userId) throw createError({ statusCode: 400, message: 'User id is required' });

  const raw = await repository.findActiveByOrganization(organizationId);
  if (!raw) throw createError({ statusCode: 404, message: 'Active process definition not found' });

  const process = new ProcessDefinition(raw);
  const normalizedRoleIds = normalizeRoleIds(roleIds, process.data.roles);
  process.data.assignments = {
    ...(process.data.assignments || {}),
    [String(userId)]: {
      userId: String(userId),
      roleIds: normalizedRoleIds,
      bindings: bindings && typeof bindings === 'object' ? bindings : {},
      status
    }
  };
  process.data.compiled = compileProcessDefinition(process.data, getDomain());
  process.status = {
    ...(process.status || {}),
    timestamp: new Date(),
    userId: actorId,
    metadata: {
      ...(process.status?.metadata || {}),
      note: `Assigned process roles to ${userId}`
    }
  };

  const updated = await repository.updateById(process.id, process);
  return new ProcessDefinition(updated).toJSON();
}

export async function archive(id, auth) {
  const process = await loadAuthorized(id, auth, 'admin');
  applyProcessStatus(process, 'ARCHIVED', auth.userId, 'Process archived');
  const updated = await repository.updateById(id, process);
  return new ProcessDefinition(updated).toJSON();
}

export async function projectEntityThroughSocket({ socketId, entityId, targetOrganizationId } = {}, auth = {}) {
  const organizationId = resolveOrganizationId(auth);
  await assertOrgAccess(auth, organizationId, 'read');
  if (!socketId) throw createError({ statusCode: 400, message: 'Socket id is required' });
  if (!entityId) throw createError({ statusCode: 400, message: 'Entity id is required' });

  const raw = await repository.findActiveByOrganization(organizationId);
  if (!raw) throw createError({ statusCode: 404, message: 'Active process definition not found' });
  const process = new ProcessDefinition(raw);
  const socket = process.data.sockets?.[socketId];
  if (!socket) throw createError({ statusCode: 404, message: 'Socket not found in active process' });

  const registry = getCutkitRegistry();
  const service = registry.getEntityService(socket.entityType);
  if (!service?.getById) throw createError({ statusCode: 500, message: `Entity service missing for ${socket.entityType}` });
  const entity = await service.getById(entityId);
  if (!entity) throw createError({ statusCode: 404, message: `${socket.entityType} not found` });

  const domainEntity = (getDomain().entities || []).find(item => item.type === socket.entityType);
  assertEntityAccess({
    entity,
    entityType: socket.entityType,
    feature: socket.feature || domainEntity?.collection || `${socket.entityType}s`,
    level: 'read',
    auth
  });

  return {
    socketId,
    entityType: socket.entityType,
    sourceOrganizationId: organizationId,
    targetOrganizationId: targetOrganizationId || null,
    projection: projectEntityFields(entity.toJSON ? entity.toJSON() : entity, socket.projection || {}),
    receiverLifecycle: socket.receiverLifecycle || { mode: 'defaultCreated' },
    visibility: socket.visibility || {}
  };
}

export async function getByIdInternal(id) {
  const raw = await repository.findById(id);
  return raw ? new ProcessDefinition(raw).toJSON() : null;
}

function applyProcessStatus(process, primary, userId, note) {
  process.applyStatus(createStatusState(primary), userId || 'SYSTEM', { note });
}

async function loadAuthorized(id, auth, level) {
  const raw = await repository.findById(id);
  if (!raw) throw createError({ statusCode: 404, message: 'Process definition not found' });
  const process = new ProcessDefinition(raw);
  await assertOrgAccess(auth, process.lineage.organizationId, level);
  return process;
}

async function assertOrgAccess(auth, organizationId, level) {
  try {
    assertEntityAccess({
      entity: { lineage: { organizationId } },
      entityType: 'organization',
      feature: 'organizations',
      level,
      auth
    });
  } catch (error) {
    if (await hasProcessDefinitionMembershipAccess(auth, organizationId, level)) return;
    throw error;
  }
}

export async function hasProcessDefinitionMembershipAccess(auth = {}, organizationId, level = 'read') {
  if (!['read', 'write', 'admin'].includes(level)) return false;
  const membership = findOrganizationMembership(auth, organizationId);
  if (!membership || membership.status === 'pending' || membership.status === 'rejected') return false;
  const roleIds = [
    membership.role,
    ...(membership.roleIds || []),
    auth.role
  ].filter(Boolean).map(value => String(value).toLowerCase());
  const adminRoles = new Set(['role_admin', 'admin', 'owner', 'creator', 'organization_admin']);
  if (roleIds.some(role => adminRoles.has(role))) return true;
  return await isSoleActiveOrganizationMember(auth.userId, organizationId);
}

function findOrganizationMembership(auth = {}, organizationId) {
  const target = organizationId?.toString();
  return (auth.memberships || []).find(item => item.organizationId?.toString() === target);
}

async function isSoleActiveOrganizationMember(userId, organizationId) {
  if (!userId || !organizationId) return false;
  const users = await usersRepository.find({ 'data.memberships.organizationId': toFlexibleId(organizationId) });
  const activeMembers = users.filter(user => (user.data?.memberships || []).some(membership =>
    membership.organizationId?.toString() === organizationId.toString() &&
    membership.status !== 'pending' &&
    membership.status !== 'rejected'
  ));
  return activeMembers.length === 1 && activeMembers[0]._id?.toString() === userId.toString();
}

function resolveOrganizationId(auth = {}) {
  const organizationId = auth.organizationId || auth.memberships?.[0]?.organizationId;
  if (!organizationId) throw createError({ statusCode: 403, message: 'Organization membership is required' });
  return organizationId;
}

function getDomain() {
  return getCutkitRegistry().getDomain('cnc');
}

function assertCanonicalProcessSource(data = {}) {
  if (data.compiled && !hasCanonicalProcessSource(data)) {
    throw createError({
      statusCode: 409,
      message: 'Process definition has only a compiled runtime contract; canonical semantic records are required for editing'
    });
  }
}

function normalizeRoleIds(roleIds, roles = {}) {
  const list = Array.isArray(roleIds) ? roleIds : [roleIds].filter(Boolean);
  const valid = list.filter(roleId => roles[roleId]);
  if (valid.length) return [...new Set(valid)];
  if (roles.role_viewer) return ['role_viewer'];
  return Object.keys(roles).slice(0, 1);
}

function projectEntityFields(entity, projection = {}) {
  const fields = projection.fields?.length ? projection.fields : ['identity.*', 'status.*'];
  const excluded = projection.excludeFields || [];
  const projected = {};
  for (const field of fields) copyProjectionPath(entity, projected, field);
  for (const field of excluded) deleteProjectionPath(projected, field);
  return projected;
}

function copyProjectionPath(source, target, path) {
  const sourcePath = path.endsWith('.*') ? path.slice(0, -2) : path;
  const value = sourcePath.split('.').reduce((current, segment) => current?.[segment], source);
  if (value === undefined) return;
  const segments = sourcePath.split('.');
  const last = segments.pop();
  const parent = segments.reduce((current, segment) => {
    if (!current[segment] || typeof current[segment] !== 'object') current[segment] = {};
    return current[segment];
  }, target);
  parent[last] = value;
}

function deleteProjectionPath(target, path) {
  const sourcePath = path.endsWith('.*') ? path.slice(0, -2) : path;
  const segments = sourcePath.split('.');
  const last = segments.pop();
  const parent = segments.reduce((current, segment) => current?.[segment], target);
  if (parent && Object.prototype.hasOwnProperty.call(parent, last)) delete parent[last];
}
