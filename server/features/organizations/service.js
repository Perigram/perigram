import * as repository from './repository.js';
import { createError } from 'h3';
import { hasPermission, resolveAuthPermissions } from '../../utils/auth-helpers.js';
import { getLineageFilter } from '../../utils/permissions.js';
import { Organization } from './model.js';
import { statusService } from '../../core/machines/service.js';
import { ObjectId } from 'mongodb';
import { legacyTypeToTemplateId } from '~/packages/processes/src/index.js';
import * as processDefinitionsService from '../process-definitions/service.js';
import { ORGANIZATION_OWNER_PERMISSIONS, ownerMembership } from '../users/organization-owner.js';

/**
 * Organizations Service - v24 Absolute Final
 */

const TENANT_CREATOR_PERMISSIONS = ORGANIZATION_OWNER_PERMISSIONS;

export async function create(data, userId, userOrg, userRole, userPermissions) {
  if (!hasPermission({ permissions: userPermissions.effectivePermissions || userPermissions.permissions }, 'organizations', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  const org = new Organization({
    identity: { uid: `org-${new ObjectId().toString().substring(0, 8)}`, name: data.name || 'New Organization' },
    data: {
      type: data.type || 'Customer',
      email: data.email || '',
      phone: data.phone || '',
      address: data.address || '',
      settings: data.settings || {}
    }
  });

  org.applyStatus('ACTIVE', userId, { note: 'Organization created' });

  const createdRaw = await repository.create(org);
  await processDefinitionsService.createActiveFromTemplate({
    organizationId: createdRaw._id,
    userId,
    templateId: data.processTemplateId || legacyTypeToTemplateId(data.type),
    actorId: userId
  });
  
  const membership = ownerMembership({
    organizationId: createdRaw._id,
  });

  await repository.addUserMembership(userId, membership, {
    role: 'role_admin',
    permissions: TENANT_CREATOR_PERMISSIONS,
    organizationId: createdRaw._id
  });

  return new Organization(createdRaw);
}

export async function createInitialForUser(userId, data = {}) {
  if (!userId) throw createError({ statusCode: 400, message: 'Missing user id' });
  if (!data.name) throw createError({ statusCode: 400, message: 'Missing organization name' });

  const processTemplateId = data.processTemplateId || legacyTypeToTemplateId(data.type || 'contractor');
  const org = new Organization({
    identity: { uid: `org-${new ObjectId().toString().substring(0, 8)}`, name: data.name },
    data: {
      processTemplateId,
      email: data.email || '',
      phone: data.phone || '',
      address: data.address || '',
      settings: data.settings || {}
    }
  });

  org.applyStatus('ACTIVE', userId, { note: 'Organization created during signup' });

  const createdRaw = await repository.create(org);
  await processDefinitionsService.createActiveFromTemplate({
    organizationId: createdRaw._id,
    userId,
    templateId: processTemplateId,
    actorId: userId
  });

  await repository.addUserMembership(userId, ownerMembership({
    organizationId: createdRaw._id
  }), {
    role: 'role_admin',
    permissions: TENANT_CREATOR_PERMISSIONS,
    organizationId: createdRaw._id
  });

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
