import * as repository from './repository.js';
import * as organizationsRepository from '../organizations/repository.js';
import { createError } from 'h3';
import { hasLineagePermission, getLineageFilter } from '~/server/utils/permissions';
import { createIdentity, createStatus, inheritLineage } from '~/server/utils/blocks';
import { mapLineageQuery } from '~/server/utils/query';
import { ObjectId } from 'mongodb';

/**
 * Warehouses Service - v24 Standardized
 */

function toDTO(warehouse) {
  if (!warehouse) return null;
  return {
    ...warehouse,
    name: warehouse.identity?.name || warehouse.name
  };
}

export async function create(data, userId, userOrg, userRole, userPermissions) {
  const { name, organizationId, address, contactPerson } = data;

  if (!name || !organizationId) {
    throw createError({ statusCode: 400, message: 'Name and organizationId are required' });
  }

  const organization = await organizationsRepository.findById(organizationId);
  if (!organization) {
    throw createError({ statusCode: 404, message: 'Organization not found' });
  }

  // 1. Lineage Inheritance
  const lineage = inheritLineage(organization, 'organization');

  // 2. Permission Check
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, lineage, 'warehouses', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const origin = createStatus('ACTIVE', userId, { note: 'Warehouse created' });

  const warehouseData = {
    identity: createIdentity(name),
    origin,
    status: origin,
    lineage,
    type: data.type || 'Standard',
    address: address || '',
    contactPerson: contactPerson || '',
    stats: {
      totalBatches: 0,
      totalSheets: 0,
      totalRemnants: 0
    }
  };

  const warehouse = await repository.create(warehouseData);
  return toDTO(warehouse);
}

export async function list(userId, userOrg, userRole, userPermissions, filter = {}) {
  // Base lineage filter from permissions
  const lineageFilter = getLineageFilter({ memberships: userPermissions.memberships, role: userRole });
  
  // Combine with user-provided filter
  const rawFilter = { ...lineageFilter, ...filter };

  // Logic upgrade: Allow Manufacturers to view warehouses of other organizations (Contractors)
  // If the user is a Manufacturer and specifically asks for a specific organizationId (likely a contractor),
  // we might want to allow it if there is a relationship.
  // However, strict lineage permissions usually prevent this unless explicitly granted.
  // For now, let's stick to the strict V24 model: You only see what you have lineage access to.
  // If a Manufacturer needs to see a Contractor's warehouse, they need a membership in that Contractor org (as a Guest/Viewer).
  // OR, we can relax it if the V24 spec allows cross-org visibility for certain roles.
  // Given the user said "It's all new app and I just want it to work", strict consistency is safer.
  // BUT, the legacy code had a specific bypass. I'll comment it out but keep the structure clean.

  /* 
  Legacy Bypass Logic:
  const isManufacturer = userPermissions.organizationData?.type === 'Manufacturer';
  if (isManufacturer && filter.organizationId) {
     // ...
  }
  */

  const finalFilter = mapLineageQuery(rawFilter);
  
  const warehouses = await repository.find(finalFilter);
  return warehouses.map(toDTO);
}

export async function getById(id, userId, userOrg, userRole, userPermissions) {
  if (!ObjectId.isValid(id)) throw createError({ statusCode: 400, message: 'Invalid ID' });

  const warehouse = await repository.findById(id);
  if (!warehouse) throw createError({ statusCode: 404, message: 'Warehouse not found' });
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, warehouse.lineage, 'warehouses', 'read')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  return toDTO(warehouse);
}

export async function update(id, updates, userId, userOrg, userRole, userPermissions) {
  const warehouse = await repository.findById(id); // Raw for permission
  if (!warehouse) throw createError({ statusCode: 404, message: 'Warehouse not found' });
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, warehouse.lineage, 'warehouses', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const { identity, origin, status, lineage, stats, ...clean } = updates;
  
  if (updates.name) warehouse.identity.name = updates.name;

  await repository.updateById(id, { identity: warehouse.identity, ...clean });
  const updated = await repository.findById(id);
  return toDTO(updated);
}

export async function updateInventoryCounts(id, counts) {
  return await repository.incrementCounts(id, counts);
}

export async function remove(id, userId, userOrg, userRole, userPermissions) {
  const warehouse = await getById(id, userId, userOrg, userRole, userPermissions);
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, warehouse.lineage, 'warehouses', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  if ((warehouse.stats?.totalBatches > 0) || (warehouse.stats?.totalSheets > 0) || (warehouse.stats?.totalRemnants > 0)) {
    throw createError({ statusCode: 409, message: 'Cannot delete warehouse with inventory' });
  }
  
  return await repository.deleteById(id);
}