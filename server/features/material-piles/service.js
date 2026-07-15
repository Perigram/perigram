import * as repository from './repository.js';
import * as warehouseService from '../warehouses/service.js';
import { createError } from 'h3';
import { hasLineagePermission, getLineageFilter } from '~/server/utils/permissions';
import { createSpecs } from '~/server/core/blocks/index.js';
import { MaterialPile } from './model.js';
import { createTransitionAuth, statusService } from '~/server/core/machines/service';
import { generateRandomString } from '~/server/utils/strings';
import { toFlexibleId } from '~/server/utils/objectid';
import { mapLineageQuery } from '~/server/utils/query';

/**
 * Material Piles Service - v24 Absolute Final
 */


export async function create(data, userId, userOrg, userRole, userPermissions) {
  const { warehouseId, catalogId, colorId, specs, quantity, serial } = data;
  const totalQuantity = Number(quantity || 0);

  if (!warehouseId || !catalogId || !colorId) {
    throw createError({ statusCode: 400, message: 'warehouseId, catalogId, and colorId are required' });
  }
  if (!Number.isInteger(totalQuantity) || totalQuantity < 0) {
    throw createError({ statusCode: 400, message: 'quantity must be a non-negative integer' });
  }

  const lineage = {
    organizationId: userOrg,
    warehouseId: toFlexibleId(warehouseId),
    catalogId: toFlexibleId(catalogId),
    colorId: toFlexibleId(colorId),
    requisitionId: data.requisitionId || null
  };

  if (!hasLineagePermission(userPermissions, lineage, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const uid = `pile-${generateRandomString(8)}`;
  const pileSerial = serial || uid;
  const materialLabel = data.material || specs?.material || data.catalogName || '';
  const colorLabel = data.color || specs?.color || data.colorName || '';
  const pileName = data.name || [materialLabel, colorLabel, pileSerial].filter(Boolean).join(' / ') || 'Material Pile';

  const pile = new MaterialPile({
    identity: { uid, name: pileName, serial: pileSerial },
    lineage,
    specs: specs || {},
    data: {
      serial: pileSerial,
      material: materialLabel,
      color: colorLabel,
      specs: specs || {},
      stock: {
        total: totalQuantity,
        used: 0
      },
      stockMovements: []
    }
  });
  appendStockMovement(pile, {
    type: 'RECEIPT',
    quantity: totalQuantity,
    userId,
    note: 'Initial material stocking'
  });

  const initialStatus = await statusService.initialStatusForOrganization(
    'material_pile',
    userOrg,
    userId,
    { note: 'Initial material stocking' }
  );
  pile.origin = initialStatus;
  pile.status = initialStatus;

  const createdRaw = await repository.create(pile);
  await warehouseService.updateInventoryCounts(warehouseId, {
    totalBatches: 1,
    totalSheets: totalQuantity
  });
  return new MaterialPile(createdRaw).toJSON();
}

export async function list(userId, userOrg, userRole, userPermissions, filter = {}) {
  const lineageFilter = getLineageFilter(userPermissions);
  const finalFilter = mapLineageQuery({ ...lineageFilter, ...filter });
  const raws = await repository.find(finalFilter);
  return raws.map(raw => new MaterialPile(raw).toJSON());
}

export async function getById(uid) {
  const raw = await repository.findById(uid);
  if (!raw) return null;
  return new MaterialPile(raw).toJSON();
}

export async function update(uid, updates, userId, userOrg, userRole, userPermissions) {
  const pileRaw = await repository.findById(uid);
  if (!pileRaw) throw createError({ statusCode: 404, message: 'Material pile not found' });
  const pile = new MaterialPile(pileRaw);
  
  if (!hasLineagePermission(userPermissions, pile.lineage, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  if (updates.status) {
    await statusService.transition('material_pile', pile._id, updates.status, userId, createTransitionAuth(userId, userRole, userPermissions), updates.statusMeta || {});
    return await getById(uid);
  }

  const previousTotal = Number(pile.data?.stock?.total || 0);
  const previousUsed = Number(pile.data?.stock?.used || 0);
  const { identity, origin, status, lineage, data: updatesData, specs, stock, name, serial, ...clean } = updates;
  const safeUpdatesData = { ...(updatesData || {}) };
  delete safeUpdatesData.stockMovements;

  if (name) pile.identity.name = name;
  if (serial) pile.identity.serial = serial;
  if (specs) pile.specs = createSpecs(specs);
  if (stock) {
    const nextTotal = Number(stock.total ?? pile.data?.stock?.total ?? 0);
    const nextUsed = Number(stock.used ?? pile.data?.stock?.used ?? 0);
    if (nextTotal < 0 || nextUsed < 0 || nextUsed > nextTotal) {
      throw createError({ statusCode: 400, message: 'stock totals must be non-negative and total must be at least used' });
    }
  }

  pile.data = {
    ...pile.data,
    ...safeUpdatesData,
    ...clean,
    ...(serial ? { serial } : {}),
    ...(specs ? { specs } : {}),
    ...(stock ? { stock } : {})
  };

  if (stock) {
    const nextTotalForMovement = Number(pile.data?.stock?.total || 0);
    const nextUsedForMovement = Number(pile.data?.stock?.used || 0);
    const totalDelta = nextTotalForMovement - previousTotal;
    const usedDelta = nextUsedForMovement - previousUsed;
    if (totalDelta !== 0 || usedDelta !== 0) {
      appendStockMovement(pile, {
        type: 'ADJUSTMENT',
        quantity: totalDelta,
        usedDelta,
        userId,
        note: 'Manual stock adjustment'
      });
    }
  }

  await repository.updateById(uid, pile);
  const nextTotal = Number(pile.data?.stock?.total || 0);
  const totalDelta = nextTotal - previousTotal;
  if (totalDelta !== 0 && pile.lineage?.warehouseId) {
    await warehouseService.updateInventoryCounts(pile.lineage.warehouseId, { totalSheets: totalDelta });
  }
  const updatedRaw = await repository.findById(uid);
  return new MaterialPile(updatedRaw).toJSON();
}

export async function updateStatus(id, state, note, user, additionalData = {}) {
  const pile = await getById(id);
  if (!pile) throw createError({ statusCode: 404, message: 'Material pile not found' });
  
  const userPermissions = { memberships: user.memberships };
  if (!hasLineagePermission(userPermissions, pile.lineage, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  return await statusService.transition('material_pile', pile._id, state, user.userId, createTransitionAuth(user.userId, user), { note, ...additionalData });
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
  
  const stock = pileRaw.data?.stock || {};
  const remainingSheets = Math.max(Number(stock.total || 0) - Number(stock.used || 0), 0);
  const result = await repository.deleteById(id);
  if (pileRaw.lineage?.warehouseId) {
    await warehouseService.updateInventoryCounts(pileRaw.lineage.warehouseId, {
      totalBatches: -1,
      totalSheets: -remainingSheets
    });
  }
  return result;
}

export async function allocate(uid, count, userId, userRole, meta = {}) {
  const allocationCount = Number(count || 0);
  if (!Number.isInteger(allocationCount) || allocationCount <= 0) {
    throw new Error('Allocation count must be a positive integer');
  }
  const pileRaw = await repository.findById(uid);
  if (!pileRaw) throw new Error('Pile not found');
  const pile = new MaterialPile(pileRaw);
  
  const available = (pile.data?.stock?.total || 0) - (pile.data?.stock?.used || 0);
  if (available < allocationCount) throw new Error('Insufficient stock in pile');
  
  pile.data.stock.used += allocationCount;
  appendStockMovement(pile, {
    type: 'ALLOCATION',
    quantity: -allocationCount,
    userId,
    ...meta
  });

  const depleted = pile.data.stock.used >= pile.data.stock.total;
  if (depleted) {
    await statusService.transitionWithResult({
      entityType: 'material_pile',
      targetId: uid,
      intent: 'depleteMaterialPile',
      auth: createTransitionAuth('SYSTEM', 'SYSTEM'),
      context: { metadata: { note: `All ${pile.data.stock.total} sheets allocated` } },
      patch: { data: pile.data }
    });
  } else {
    await repository.updateById(uid, pile);
  }
  if (pile.lineage?.warehouseId) {
    await warehouseService.updateInventoryCounts(pile.lineage.warehouseId, { totalSheets: -allocationCount });
  }
  
  return await getById(uid);
}

function appendStockMovement(pile, movement = {}) {
  const stock = pile.data?.stock || {};
  const movements = Array.isArray(pile.data?.stockMovements) ? pile.data.stockMovements : [];
  pile.data = {
    ...(pile.data || {}),
    stockMovements: [
      ...movements,
      cleanMovementEntry({
        at: new Date(),
        type: movement.type,
        quantity: Number(movement.quantity || 0),
        usedDelta: movement.usedDelta === undefined ? undefined : Number(movement.usedDelta || 0),
        userId: movement.userId,
        note: movement.note,
        queueId: movement.queueId,
        runId: movement.runId,
        pileId: movement.pileId,
        stock: {
          total: Number(stock.total || 0),
          used: Number(stock.used || 0)
        }
      })
    ].slice(-100)
  };
}

function cleanMovementEntry(entry = {}) {
  return Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined));
}
