import * as repository from './repository.js';
import { createError } from 'h3';
import { hasLineagePermission, getLineageFilter } from '~/server/utils/permissions';
import { createStatus, registerService } from '~/server/utils/blocks';
import { MaterialPile } from './model.js';
import { statusService } from '~/server/core/machines/service';
import { generateRandomString } from '~/server/utils/strings';
import { toObjectId, isValidObjectId } from '~/server/utils/objectid';

/**
 * Material Piles Service - v24 Absolute Final
 */

registerService('pile', {
  getById: (uid) => getById(uid)
});

export async function create(data, userId, userOrg, userRole, userPermissions) {
  const { warehouseId, catalogId, colorId, specs, quantity, serial } = data;

  if (!warehouseId || !catalogId || !colorId || !serial) {
    throw createError({ statusCode: 400, message: 'warehouseId, catalogId, colorId, and serial are required' });
  }

  const lineage = {
    organizationId: userOrg,
    warehouseId: warehouseId,
    catalogId: catalogId,
    colorId: colorId,
    requisitionId: data.requisitionId || null
  };

  if (!hasLineagePermission(userPermissions, lineage, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const uid = `pile-${generateRandomString(8)}`;

  const pile = new MaterialPile({
    identity: { uid },
    lineage,
    params: { serial, specs, quantity }
  });

  pile.applyStatus('STOCKED', userId, { note: 'Initial material stocking' });

  const createdRaw = await repository.create(pile);
  return new MaterialPile(createdRaw);
}

export async function list(userId, userOrg, userRole, userPermissions, filter = {}) {
  const lineageFilter = getLineageFilter(userPermissions);
  const raws = await repository.find({ ...lineageFilter });
  return raws.map(raw => new MaterialPile(raw));
}

export async function getById(uid) {
  const raw = await repository.findById(uid);
  if (!raw) return null;
  return new MaterialPile(raw);
}

export async function update(uid, updates, userId, userOrg, userRole, userPermissions) {
  const pileRaw = await repository.findById(uid);
  if (!pileRaw) throw createError({ statusCode: 404, message: 'Material pile not found' });
  const pile = new MaterialPile(pileRaw);
  
  if (!hasLineagePermission(userPermissions, pile.lineage, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  if (updates.status) {
    await statusService.transition('material_pile', pile._id, updates.status, userId, userRole, updates.statusMeta || {});
    return await getById(uid);
  }

  const { identity, origin, status, lineage, data: updatesData, ...clean } = updates;
  
  pile.data = {
    ...pile.data,
    ...updatesData,
    ...clean
  };

  await repository.updateById(uid, pile);
  const updatedRaw = await repository.findById(uid);
  return new MaterialPile(updatedRaw);
}

export async function updateStatus(id, state, note, user, additionalData = {}) {
  const pile = await getById(id);
  if (!pile) throw createError({ statusCode: 404, message: 'Material pile not found' });
  
  const userPermissions = { memberships: user.memberships, role: user.role };
  if (!hasLineagePermission(userPermissions, pile.lineage, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  return await statusService.transition('material_pile', pile._id, state, user.userId, user.role, { note, ...additionalData });
}

export async function remove(id, userId, userOrg, userRole, userPermissions) {
  const pileRaw = await repository.findById(id);
  if (!pileRaw) throw createError({ statusCode: 404, message: 'Material pile not found' });
  
  if (!hasLineagePermission(userPermissions, pileRaw.lineage, 'materials', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  if (pileRaw.data?.stock?.used > 0) {
    throw createError({ statusCode: 400, message: 'Cannot delete pile with used stock' });
  }
  
  return await repository.deleteById(id);
}

export async function allocate(uid, count, userId, userRole) {
  const pileRaw = await repository.findById(uid);
  if (!pileRaw) throw new Error('Pile not found');
  const pile = new MaterialPile(pileRaw);
  
  const available = (pile.data?.stock?.total || 0) - (pile.data?.stock?.used || 0);
  if (available < count) throw new Error('Insufficient stock in pile');
  
  pile.data.stock.used += count;

  await repository.updateById(uid, pile);
  
  if (pile.data.stock.used >= pile.data.stock.total) {
    await statusService.transition('material_pile', uid, 'DEPLETED', userId, 'SYSTEM', {
      note: `All ${pile.data.stock.total} sheets allocated`
    });
  }
  
  return await getById(uid);
}