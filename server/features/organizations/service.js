import * as repository from './repository.js';
import * as usersRepository from '../users/repository.js';
import { createError } from 'h3';
import { hasPermission } from '~/server/utils/auth-helpers';
import { getOrgFilter, checkEntityAccess, getLineageFilter } from '~/server/utils/permissions';
import { PERMISSION_TEMPLATES } from '../users/permission-templates.js';
import { initializeStatus, addStatus } from '~/server/features/statuses/service';
import { ObjectId } from 'mongodb';

export async function create(data, userId, userOrg, userRole, userPermissions) {
  if (!hasPermission({ permissions: userPermissions.permissions, role: userRole }, 'organizations', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  const validTypes = ['Manufacturer', 'Contractor', 'Customer', 'ServiceProvider'];
  if (!validTypes.includes(data.type)) {
    throw createError({ statusCode: 400, message: 'Invalid organization type' });
  }
  
  const settings = {};
  if (data.type === 'Contractor') {
    settings.contractor = {
      canCut: data.canCut ?? true,
      canInstall: data.canInstall ?? false,
      balance: 0
    };
  }
  
  const org = await repository.create({
    name: data.name,
    type: data.type,
    email: data.email,
    phone: data.phone,
    address: data.address,
    settings,
    createdBy: userId
  });

  await initializeStatus('organizations', org._id.toString(), userId, 'Organization created');

  const role = `${data.type}Admin`;
  const permissions = PERMISSION_TEMPLATES[role] || PERMISSION_TEMPLATES.IndividualUser;
  
  const db = await (await import('~/server/db/mongo')).connectDB();
  const membership = {
    organizationId: org._id,
    role,
    permissions,
    status: 'active'
  };

  await db.collection('users').updateOne(
    { _id: new ObjectId(userId) },
    { $push: { memberships: membership } }
  );
  
  return org;
}

export async function list(userId, userOrg, userRole, userPermissions, filter = {}) {
  const finalFilter = { ...filter, ...getLineageFilter({ memberships: userPermissions.memberships, role: userRole }) };
  
  if (userRole !== 'SuperAdmin') {
    if (filter.type === 'Manufacturer') {
      return await repository.find({ type: 'Manufacturer' });
    }
    // Discovery for manufacturers to find contractors
    if (filter.type === 'Contractor' && userPermissions.organizationData?.type === 'Manufacturer') {
      return await repository.find({ type: 'Contractor' });
    }
  }

  return await repository.find(finalFilter);
}

export async function getById(id, userId, userOrg, userRole, userPermissions) {
  const org = await repository.findById(id);
  if (!org) throw createError({ statusCode: 404, message: 'Organization not found' });
  
  if (userRole !== 'SuperAdmin' && !userPermissions.memberships?.some(m => m.organizationId?.toString() === id)) {
    throw createError({ statusCode: 403, message: 'Cannot view other organizations' });
  }
  
  return org;
}

export async function update(id, updates, userId, userOrg, userRole, userPermissions) {
  await getById(id, userId, userOrg, userRole, userPermissions);
  
  if (!hasPermission({ permissions: userPermissions.permissions, role: userRole }, 'organizations', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  delete updates._id;
  delete updates.createdAt;
  delete updates.type;
  
  await repository.updateById(id, updates);
  return await repository.findById(id);
}

export async function remove(id, userId, userOrg, userRole, userPermissions) {
  if (userRole !== 'SuperAdmin') {
    throw createError({ statusCode: 403, message: 'Only SuperAdmin can delete organizations' });
  }
  
  await repository.deleteById(id);
  return { success: true };
}
