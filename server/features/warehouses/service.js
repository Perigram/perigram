import * as repository from './repository.js';
import * as organizationsService from '../organizations/service.js';
import { createError } from 'h3';
import { hasLineagePermission, getLineageFilter } from '~/server/utils/permissions';
import { inheritLineage, registerService } from '~/server/utils/blocks';
import { Warehouse } from './model.js';
import { statusService } from '~/server/core/machines/service';
import { mapLineageQuery } from '~/server/utils/query';
import { ObjectId } from 'mongodb';

/**
 * Warehouses Service - v24 Absolute Final
 */

registerService('warehouse', {
  getById: (uid) => getById(uid)
});

export async function create(data, userId, userOrg, userRole, userPermissions) {
  const { name, organizationId, type, address, contactPerson } = data;
  const organization = await organizationsService.getById(organizationId);
  if (!organization) throw createError({ statusCode: 404, message: 'Organization not found' });

  const warehouse = new Warehouse({
    identity: { uid: `wh-${ObjectId().toString().substring(0, 8)}`, name: name || 'New Warehouse' },
    lineage: inheritLineage(organization, 'organization'),
    params: { type, address, contactPerson }
  });

  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, warehouse.lineage, 'warehouses', 'write')) {
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
  const finalFilter = mapLineageQuery({ ...getLineageFilter({ memberships: userPermissions.memberships, role: userRole }), ...filter });
  const raws = await repository.find(finalFilter);
  return raws.map(raw => new Warehouse(raw));
}

export async function update(uid, updates, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(uid);
  if (!raw) throw createError({ statusCode: 404, message: 'Warehouse not found' });
  const warehouse = new Warehouse(raw);
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, warehouse.lineage, 'warehouses', 'write')) {
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
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, warehouse.lineage, 'warehouses', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  return await repository.deleteById(uid);
}
