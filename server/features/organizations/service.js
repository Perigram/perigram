import * as repository from './repository.js';
import { createError } from 'h3';
import { hasPermission } from '~/server/utils/auth-helpers';
import { getOrgFilter, checkEntityAccess } from '~/server/utils/permissions';

export async function create(data, user) {
  // Check permission
  if (!hasPermission(user, 'organizations', 'admin')) {
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
  
  return await repository.create({
    name: data.name,
    type: data.type,
    email: data.email,
    phone: data.phone,
    address: data.address,
    settings,
    createdBy: user.userId
  });
}

export async function list(user, filter = {}) {
  // Apply organization filter
  const orgFilter = getOrgFilter(user);
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
  
  // Don't allow type change
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