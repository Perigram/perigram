import * as repository from './repository.js';
import { createError } from 'h3';
import { hasPermission } from '../../utils/auth-helpers.js';
import { getLineageFilter } from '../../utils/permissions.js';
import { registerService } from '../../utils/blocks.js';
import { Organization } from './model.js';
import { statusService } from '../../core/machines/service.js';
import { ObjectId } from 'mongodb';
import { connectDB } from '../../db/mongo.js';
import { PERMISSION_TEMPLATES } from '../users/permission-templates.js';
import { toFlexibleId } from '../../utils/objectid.js';

/**
 * Organizations Service - v24 Absolute Final
 */

registerService('organization', {
  getById: (uid) => getById(uid)
});

export async function create(data, userId, userOrg, userRole, userPermissions) {
  if (!hasPermission({ permissions: userPermissions.permissions, role: userRole }, 'organizations', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  const org = new Organization({
    identity: { uid: `org-${new ObjectId().toString().substring(0, 8)}`, name: data.name || 'New Organization' },
    params: { type: data.type, email: data.email, phone: data.phone, address: data.address, settings: data.settings }
  });

  org.applyStatus('ACTIVE', userId, { note: 'Organization created' });

  const createdRaw = await repository.create(org);
  
  // Restore Membership Creation
  const db = await connectDB();
  const orgRole = `${data.type}Admin`;
  const orgPermissions = PERMISSION_TEMPLATES[orgRole] || PERMISSION_TEMPLATES['IndividualUser'];
  
  const membership = {
    organizationId: createdRaw._id,
    role: orgRole,
    permissions: orgPermissions,
    status: 'active'
  };

  await db.collection('users').updateOne(
    { _id: toFlexibleId(userId) },
    { 
      $push: { "data.memberships": membership },
      $set: {
        "lineage.organizationId": createdRaw._id,
        "data.role": orgRole,
        "data.permissions": orgPermissions
      }
    }
  );

  return new Organization(createdRaw);
}

export async function getById(uid) {
  const raw = await repository.findById(uid);
  if (!raw) return null;
  return new Organization(raw);
}

export async function list(userId, userOrg, userRole, userPermissions, filter = {}) {
  const finalFilter = { ...filter, ...getLineageFilter({ memberships: userPermissions.memberships, role: userRole }) };
  const raws = await repository.find(finalFilter);
  return raws.map(raw => new Organization(raw));
}

export async function update(uid, updates, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(uid);
  if (!raw) throw createError({ statusCode: 404, message: 'Organization not found' });
  const org = new Organization(raw);
  
  if (!hasPermission({ permissions: userPermissions.permissions, role: userRole }, 'organizations', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  if (updates.name) org.identity.name = updates.name;
  org.data = { ...org.data, ...(updates.data || {}) };

  await repository.updateById(uid, org);
  const updatedRaw = await repository.findById(uid);
  return new Organization(updatedRaw);
}

export async function remove(uid, userId, userOrg, userRole, userPermissions) {
  if (userRole !== 'SuperAdmin') throw createError({ statusCode: 403, message: 'Only SuperAdmin can delete' });
  return await repository.deleteById(uid);
}
