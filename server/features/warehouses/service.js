import * as repository from './repository.js';
import * as organizationsService from '../organizations/service.js';
import { createError } from 'h3';
import { hasLineagePermission, getLineageFilter } from '~/server/utils/permissions';
import { inheritLineage } from '~/server/core/blocks/index.js';
import { Warehouse } from './model.js';
import { statusService } from '~/server/core/machines/service';
import { mapLineageQuery } from '~/server/utils/query';
import { ObjectId } from 'mongodb';

/**
 * Warehouses Service - v24 Absolute Final
 */


export async function create(data, userId, userOrg, userRole, userPermissions) {
  const { name, organizationId, type, address, contactPerson } = data;
  const targetOrganizationId = organizationId || userOrg;
  if (!targetOrganizationId) throw createError({ statusCode: 400, message: 'Organization context required' });
  const organization = await organizationsService.getById(targetOrganizationId);
  if (!organization) throw createError({ statusCode: 404, message: 'Organization not found' });

  const warehouse = new Warehouse({
    identity: { uid: `wh-${new ObjectId().toString().substring(0, 8)}`, name: name || 'New Warehouse' },
    lineage: inheritLineage(organization, 'organization'),
    data: {
      type: type || 'Standard',
      address: address || '',
      contactPerson: contactPerson || '',
      stats: { totalSheets: 0, totalRemnants: 0 }
    }
  });

  if (!hasLineagePermission({ memberships: userPermissions.memberships }, warehouse.lineage, 'warehouses', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  warehouse.applyStatus('ACTIVE', userId, { note: 'Warehouse created' });

  const createdRaw = await repository.create(warehouse);
  return new Warehouse(createdRaw);
}

export async function getById(uid) {
  const raw = await repository.findById(uid);
  if (!raw) return null;
  return new Warehouse(raw);
}

export async function list(userId, userOrg, userRole, userPermissions, filter = {}) {
  const finalFilter = mapLineageQuery({ ...getLineageFilter({ memberships: userPermissions.memberships }), ...filter });
  const raws = await repository.find(finalFilter);
  return raws.map(raw => new Warehouse(raw));
}

export async function update(uid, updates, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(uid);
  if (!raw) throw createError({ statusCode: 404, message: 'Warehouse not found' });
  const warehouse = new Warehouse(raw);
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships }, warehouse.lineage, 'warehouses', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  if (updates.name) warehouse.identity.name = updates.name;
  warehouse.data = { ...warehouse.data, ...(updates.data || {}) };

  await repository.updateById(uid, warehouse);
  const updatedRaw = await repository.findById(uid);
  return new Warehouse(updatedRaw);
}

export async function remove(uid, userId, userOrg, userRole, userPermissions) {
  const warehouse = await getById(uid);
  if (!warehouse) throw createError({ statusCode: 404, message: 'Warehouse not found' });
  if (!hasLineagePermission({ memberships: userPermissions.memberships }, warehouse.lineage, 'warehouses', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  const stats = warehouse.data?.stats || {};
  if ((stats.totalBatches || 0) > 0 || (stats.totalSheets || 0) > 0 || (stats.totalRemnants || 0) > 0) {
    throw createError({ statusCode: 400, message: 'Cannot delete warehouse with inventory' });
  }
  return await repository.deleteById(uid);
}

export async function updateInventoryCounts(uid, increments = {}) {
  const warehouse = await getById(uid);
  if (!warehouse) throw createError({ statusCode: 404, message: 'Warehouse not found' });

  const stats = { ...(warehouse.data?.stats || {}) };
  for (const [key, value] of Object.entries(increments)) {
    const nextValue = Number(stats[key] || 0) + Number(value || 0);
    stats[key] = Math.max(nextValue, 0);
  }

  await repository.updateById(uid, { data: { ...warehouse.data, stats } });
  return await getById(uid);
}
