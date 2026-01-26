import * as repository from './repository.js';
import { createError } from 'h3';
import { hasPermission } from '~/server/utils/auth-helpers';
import { getLineageFilter } from '~/server/utils/permissions';
import { ObjectId } from 'mongodb';
import { initializeStatus, addStatus } from '~/server/features/statuses/service';

export async function create(data, userId, userOrg, userRole, userPermissions) {
  if (!hasPermission({ permissions: userPermissions.permissions, role: userRole }, 'warehouses', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  if (!data.name || !data.organizationId) {
    throw createError({ statusCode: 400, message: 'Name and organizationId required' });
  }
  
  const orgId = new ObjectId(data.organizationId);
  if (userRole !== 'SuperAdmin' && !userPermissions.memberships?.some(m => m.organizationId?.toString() === data.organizationId)) {
    throw createError({ statusCode: 403, message: 'Cannot create warehouse for other organization' });
  }
  
  const warehouse = await repository.create({
    name: data.name,
    organizationId: orgId,
    address: data.address || '',
    contactPerson: data.contactPerson || '',
    createdBy: userId
  });

  await initializeStatus('warehouses', warehouse._id.toString(), userId, 'Warehouse created');
  
  return warehouse;
}

export async function list(userId, userOrg, userRole, userPermissions, filter = {}) {
  const finalFilter = { ...filter, ...getLineageFilter({ memberships: userPermissions.memberships, role: userRole }) };
  
  // Logic upgrade: Allow Manufacturers to view warehouses of other organizations (Contractors)
  const isManufacturer = userPermissions.organizationData?.type === 'Manufacturer';
  if (isManufacturer && filter.organizationId) {
     finalFilter.organizationId = new ObjectId(filter.organizationId);
     delete finalFilter['lineage.organizationId']; // Bypass lineage filter if specifically looking for contractor wh
  }
  
  return await repository.find(finalFilter);
}

export async function getById(id, userId, userOrg, userRole, userPermissions) {
  const warehouse = await repository.findById(id);
  if (!warehouse) throw createError({ statusCode: 404, message: 'Warehouse not found' });
  
  if (userRole !== 'SuperAdmin' && !userPermissions.memberships?.some(m => m.organizationId?.toString() === warehouse.organizationId.toString())) {
    throw createError({ statusCode: 403, message: 'Cannot view warehouse from other organization' });
  }
  
  return warehouse;
}

export async function update(id, updates, userId, userOrg, userRole, userPermissions) {
  const warehouse = await getById(id, userId, userOrg, userRole, userPermissions);
  
  if (!hasPermission({ permissions: userPermissions.permissions, role: userRole }, 'warehouses', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  delete updates._id;
  delete updates.createdAt;
  delete updates.organizationId;
  
  await repository.updateById(id, updates);
  return await repository.findById(id);
}

export async function updateInventoryCounts(id, counts) {
  return await repository.incrementCounts(id, counts);
}

export async function remove(id, userId, userOrg, userRole, userPermissions) {
  if (!hasPermission({ permissions: userPermissions.permissions, role: userRole }, 'warehouses', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  const warehouse = await getById(id, userId, userOrg, userRole, userPermissions);
  
  if (warehouse.totalBatches > 0 || warehouse.totalSheets > 0 || warehouse.totalRemnants > 0) {
    throw createError({ statusCode: 409, message: 'Cannot delete warehouse with inventory' });
  }
  
  await repository.deleteById(id);
  return { success: true };
}
