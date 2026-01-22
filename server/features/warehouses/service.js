import * as repository from './repository.js';
import { createError } from 'h3';
import { hasPermission } from '~/server/utils/auth-helpers';
import { getOrgFilter, checkEntityAccess } from '~/server/utils/permissions';
import { ObjectId } from 'mongodb';

export async function create(data, user) {
  // Only org admins can create warehouses
  if (!hasPermission(user, 'warehouses', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  // Validate required fields
  if (!data.name || !data.organizationId) {
    throw createError({ statusCode: 400, message: 'Name and organizationId required' });
  }
  
  // Verify user can access this organization
  const orgId = new ObjectId(data.organizationId);
  if (!checkEntityAccess(user, { organizationId: orgId }, orgId)) {
    throw createError({ statusCode: 403, message: 'Cannot create warehouse for other organization' });
  }
  
  return await repository.create({
    name: data.name,
    organizationId: orgId,
    address: data.address || '',
    contactPerson: data.contactPerson || '',
    createdBy: user.userId
  });
}

export async function list(user, filter = {}) {
  // Apply organization filter
  const orgFilter = getOrgFilter(user);
  const finalFilter = { ...filter };
  
  // Logic upgrade: Allow Manufacturers to view warehouses of other organizations (Contractors)
  // if they are specifically querying for them (e.g., for shipping batches)
  const isManufacturer = user.organizationData?.type === 'Manufacturer';
  const queryingSpecificOrg = filter.organizationId;
  
  if (isManufacturer && queryingSpecificOrg) {
     // Trust the passed organizationId filter (Manufacturer viewing Contractor's warehouse)
     // TODO: Could verify that the target org is indeed a Contractor
     finalFilter.organizationId = new ObjectId(filter.organizationId);
  } else if (orgFilter.organizationId) {
     // Default: Restrict to own organization
     finalFilter.organizationId = orgFilter.organizationId;
  }
  
  return await repository.find(finalFilter);
}

export async function getById(id, user) {
  const warehouse = await repository.findById(id);
  if (!warehouse) {
    throw createError({ statusCode: 404, message: 'Warehouse not found' });
  }
  
  // Check access
  if (!checkEntityAccess(user, warehouse, warehouse.organizationId)) {
    throw createError({ statusCode: 403, message: 'Cannot view warehouse from other organization' });
  }
  
  return warehouse;
}

export async function update(id, updates, user) {
  const warehouse = await repository.findById(id);
  if (!warehouse) {
    throw createError({ statusCode: 404, message: 'Warehouse not found' });
  }
  
  // Check access
  if (!checkEntityAccess(user, warehouse, warehouse.organizationId)) {
    throw createError({ statusCode: 403, message: 'Cannot update warehouse from other organization' });
  }
  
  // Check permission level
  if (!hasPermission(user, 'warehouses', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  // Don't allow organizationId change
  delete updates._id;
  delete updates.createdAt;
  delete updates.organizationId;
  
  const success = await repository.updateById(id, updates);
  if (!success) {
    throw createError({ statusCode: 500, message: 'Update failed' });
  }
  
  return await repository.findById(id);
}

export async function updateInventoryCounts(id, counts) {
  // Internal method used by material tracking features
  return await repository.incrementCounts(id, counts);
}

export async function remove(id, user) {
  if (!hasPermission(user, 'warehouses', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  const warehouse = await repository.findById(id);
  if (!warehouse) {
    throw createError({ statusCode: 404, message: 'Warehouse not found' });
  }
  
  // Check access
  if (!checkEntityAccess(user, warehouse, warehouse.organizationId)) {
    throw createError({ statusCode: 403, message: 'Cannot delete warehouse from other organization' });
  }
  
  // Check if warehouse has inventory
  if (warehouse.totalBatches > 0 || warehouse.totalSheets > 0 || warehouse.totalRemnants > 0) {
    throw createError({ statusCode: 409, message: 'Cannot delete warehouse with inventory' });
  }
  
  const success = await repository.deleteById(id);
  if (!success) {
    throw createError({ statusCode: 404, message: 'Warehouse not found' });
  }
  
  return { success: true };
}