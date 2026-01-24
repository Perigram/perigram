import * as repository from './repository.js';
import { createError } from 'h3';
import { hasLineagePermission, getLineageFilter } from '~/server/utils/permissions';
import { createIdentity, createStatus, createSpecs } from '~/server/utils/blocks';
import { statusService } from '~/server/core/machines/service';
import { ObjectId } from 'mongodb';

/**
 * Material Piles Service - v24 Standardized
 */

export async function create(data, userId, userOrg, userRole, userPermissions) {
  const { warehouseId, catalogId, colorId, specs, quantity, name, serial } = data;

  if (!warehouseId || !catalogId || !colorId) {
    throw createError({ statusCode: 400, message: 'warehouseId, catalogId, and colorId are required' });
  }

  // 1. Lineage Building
  const lineage = {
    organizationId: new ObjectId(userOrg),
    warehouseId: new ObjectId(warehouseId),
    catalogId: new ObjectId(catalogId),
    colorId: new ObjectId(colorId),
    requisitionId: data.requisitionId ? new ObjectId(data.requisitionId) : null
  };

  // 2. Permission Check
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, lineage, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const origin = createStatus('STOCKED', userId, { note: 'Initial material stocking' });

  const pileData = {
    identity: createIdentity(name || 'New Pile', '', serial),
    origin,
    status: origin,
    lineage,
    specs: createSpecs(specs),
    stock: {
      total: quantity || 0,
      used: 0
    }
  };

  return await repository.create(pileData);
}

export async function list(userId, userOrg, userRole, userPermissions, options = {}) {
  const filter = getLineageFilter({ memberships: userPermissions.memberships, role: userRole });
  return await repository.find(filter);
}

export async function getById(id, userId, userOrg, userRole, userPermissions) {
  if (!ObjectId.isValid(id)) {
    throw createError({ statusCode: 400, message: 'Invalid ID format' });
  }
  
  const pile = await repository.findById(id);
  if (!pile) {
    throw createError({ statusCode: 404, message: 'Material pile not found' });
  }
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, pile.lineage, 'materials', 'read')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  return pile;
}

export async function update(id, updates, userId, userOrg, userRole, userPermissions) {
  const pile = await getById(id, userId, userOrg, userRole, userPermissions);
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, pile.lineage, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  // Status updates must go through statusService
  if (updates.status) {
    await statusService.transition('material_pile', pile._id, updates.status, userId, userRole, updates.statusMeta || {});
    delete updates.status;
  }

  const { identity, origin, status, lineage, specs, ...clean } = updates;
  
  // Identity updates
  if (updates.name) pile.identity.name = updates.name;
  if (updates.serial) pile.identity.serial = updates.serial;

  await repository.updateById(id, { identity: pile.identity, ...clean });
  return await repository.findById(id);
}

export async function remove(id, userId, userOrg, userRole, userPermissions) {
  const pile = await getById(id, userId, userOrg, userRole, userPermissions);
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, pile.lineage, 'materials', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  if (pile.stock.used > 0) {
    throw createError({ statusCode: 400, message: 'Cannot delete pile with used stock' });
  }
  
  return await repository.deleteById(id);
}

/**
 * Allocate sheets from a pile
 * Called by nesting/production logic
 */
export async function allocate(id, count, userId, userRole) {
  // Internal or System call validation
  const pile = await repository.findById(id);
  if (!pile) throw new Error('Pile not found');
  
  const available = pile.stock.total - pile.stock.used;
  if (available < count) throw new Error('Insufficient stock in pile');
  
  const newUsed = pile.stock.used + count;
  await repository.updateById(id, { 'stock.used': newUsed });
  
  if (newUsed >= pile.stock.total) {
    await statusService.transition('material_pile', id, 'DEPLETED', userId, 'SYSTEM', {
      note: `All ${pile.stock.total} sheets allocated`
    });
  }
  
  return pile;
}