import * as repository from './repository.js';
import * as usersRepository from '../users/repository.js';
import { createError } from 'h3';
import { hasPermission } from '~/server/utils/auth-helpers';
import { getOrgFilter, checkEntityAccess } from '~/server/utils/permissions';
import { PERMISSION_TEMPLATES } from '../users/permission-templates.js';

export async function create(data, user) {
  // Check permission
  if (!hasPermission(user, 'organizations', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  // Validate type
  const validTypes = ['Manufacturer', 'Contractor', 'Customer', 'ServiceProvider'];
  if (!validTypes.includes(data.type)) {
    throw createError({ statusCode: 400, message: 'Invalid organization type' });
  }
  
  // Initialize settings based on type
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
    createdBy: user.userId
  });

  // Always add to user memberships as Active Admin
  const role = `${data.type}Admin`;
  const permissions = PERMISSION_TEMPLATES[role] || PERMISSION_TEMPLATES.IndividualUser;
  
  const db = await (await import('~/server/db/mongo')).connectDB();
  const membership = {
    organizationId: org._id,
    role,
    permissions,
    status: 'active'
  };

  const userUpdates = {
    $push: { memberships: membership }
  };

  // If this is their first org (or they have none active), make it current
  const freshUser = await usersRepository.findById(user.userId);
  if (!freshUser.organizationId || !freshUser.currentOrganizationId) {
    userUpdates.$set = {
      organizationId: org._id,
      role,
      permissions,
      currentOrganizationId: org._id
    };
  }

  await db.collection('users').updateOne(
    { _id: freshUser._id },
    userUpdates
  );
  
  return org;
}

export async function list(user, filter = {}) {
  // Apply organization filter
  const orgFilter = getOrgFilter(user);
  
  // Logic upgrade: If a user is searching specifically for Manufacturers (discovery),
  // bypass the organization isolation filter.
  if (user.role !== 'SuperAdmin') {
    // Discovery: Contractors finding Manufacturers
    if (filter.type === 'Manufacturer') {
      return await repository.find({ type: 'Manufacturer' });
    }
    // Discovery: Manufacturers finding Contractors (for shipping)
    if (filter.type === 'Contractor' && user.organizationData?.type === 'Manufacturer') {
      return await repository.find({ type: 'Contractor' });
    }
  }

  const finalFilter = { ...filter, ...orgFilter };
  
  return await repository.find(finalFilter);
}

export async function getById(id, user) {
  const org = await repository.findById(id);
  if (!org) {
    throw createError({ statusCode: 404, message: 'Organization not found' });
  }
  
  // Check access
  if (!checkEntityAccess(user, org, org._id)) {
    throw createError({ statusCode: 403, message: 'Cannot view other organizations' });
  }
  
  return org;
}

export async function update(id, updates, user) {
  const org = await repository.findById(id);
  if (!org) {
    throw createError({ statusCode: 404, message: 'Organization not found' });
  }
  
  // Check access
  if (!checkEntityAccess(user, org, org._id)) {
    throw createError({ statusCode: 403, message: 'Cannot update other organizations' });
  }
  
  // Check permission level
  if (!hasPermission(user, 'organizations', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  // Don't allow critical field changes
  delete updates._id;
  delete updates.createdAt;
  delete updates.type;
  
  const success = await repository.updateById(id, updates);
  if (!success) {
    throw createError({ statusCode: 500, message: 'Update failed' });
  }
  
  return await repository.findById(id);
}

export async function remove(id, user) {
  if (!hasPermission(user, 'organizations', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  const success = await repository.deleteById(id);
  if (!success) {
    throw createError({ statusCode: 404, message: 'Organization not found' });
  }
  
  return { success: true };
}