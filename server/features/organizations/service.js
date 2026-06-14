import * as repository from './repository.js';
import { createError } from 'h3';
import { hasPermission } from '../../utils/auth-helpers.js';
import { getLineageFilter } from '../../utils/permissions.js';
import { Organization } from './model.js';
import { statusService } from '../../core/machines/service.js';
import { ObjectId } from 'mongodb';
import { PERMISSION_TEMPLATES } from '../users/permission-templates.js';

/**
 * Organizations Service - v24 Absolute Final
 */


export async function create(data, userId, userOrg, userRole, userPermissions) {
  if (!hasPermission({ permissions: userPermissions.permissions }, 'organizations', 'write')) {
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
  
  const orgRole = `${data.type}Admin`;
  const orgPermissions = PERMISSION_TEMPLATES[orgRole] || PERMISSION_TEMPLATES['IndividualUser'];
  
  const membership = {
    organizationId: createdRaw._id,
    role: orgRole,
    permissions: orgPermissions,
    status: 'active'
  };

  await repository.addUserMembership(userId, membership, {
    role: orgRole,
    permissions: orgPermissions,
    organizationId: createdRaw._id
  });

  return new Organization(createdRaw);
}

export async function createInitialForUser(userId, data = {}) {
  if (!userId) throw createError({ statusCode: 400, message: 'Missing user id' });
  if (!data.name) throw createError({ statusCode: 400, message: 'Missing organization name' });

  const orgType = data.type || 'Contractor';
  const org = new Organization({
    identity: { uid: `org-${new ObjectId().toString().substring(0, 8)}`, name: data.name },
    data: {
      type: orgType,
      email: data.email || '',
      phone: data.phone || '',
      address: data.address || '',
      settings: data.settings || {}
    }
  });

  org.applyStatus('ACTIVE', userId, { note: 'Organization created during signup' });

  const createdRaw = await repository.create(org);
  const orgRole = `${orgType}Admin`;
  const orgPermissions = PERMISSION_TEMPLATES[orgRole] || PERMISSION_TEMPLATES['IndividualUser'];

  await repository.addUserMembership(userId, {
    organizationId: createdRaw._id,
    role: orgRole,
    permissions: orgPermissions,
    status: 'active'
  }, {
    role: orgRole,
    permissions: orgPermissions,
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
  const finalFilter = { ...filter, ...getLineageFilter({ memberships: userPermissions.memberships }) };
  const raws = await repository.find(finalFilter);
  return raws.map(raw => new Organization(raw));
}

export async function update(uid, updates, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(uid);
  if (!raw) throw createError({ statusCode: 404, message: 'Organization not found' });
  const org = new Organization(raw);
  
  if (!hasPermission({ permissions: userPermissions.permissions }, 'organizations', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  if (updates.name) org.identity.name = updates.name;
  org.data = { ...org.data, ...(updates.data || {}) };

  await repository.updateById(uid, org);
  const updatedRaw = await repository.findById(uid);
  return new Organization(updatedRaw);
}

export async function remove(uid, userId, userOrg, userRole, userPermissions) {
  if (!hasPermission({ permissions: userPermissions.permissions }, 'organizations', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  return await repository.deleteById(uid);
}

export async function getByIds(ids) {
  if (!ids || ids.length === 0) return [];
  const raws = await repository.findByIds(ids);
  return raws.map(raw => new Organization(raw).toJSON());
}
