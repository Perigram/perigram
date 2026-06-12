import * as repository from './repository.js';
import * as materialPilesRepository from '../material-piles/repository.js';
import { createError } from 'h3';
import { hasLineagePermission, getLineageFilter } from '~/server/utils/permissions';
import { createStatus, inheritLineage } from '~/server/core/blocks/index.js';
import { Sheet } from './model.js';
import { createTransitionAuth, statusService } from '~/server/core/machines/service';
import { generateRandomString } from '~/server/utils/strings';
import { mapLineageQuery } from '~/server/utils/query';

/**
 * Sheets Service - v24 Absolute Final
 */


export async function createFromPile(pileId, count, userId, userRole, userPermissions) {
  const pileRaw = await materialPilesRepository.findById(pileId);
  if (!pileRaw) throw createError({ statusCode: 404, message: 'Material pile not found' });

  if (!hasLineagePermission(userPermissions, pileRaw.lineage, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const available = (pileRaw.data?.stock?.total || 0) - (pileRaw.data?.stock?.used || 0);
  if (available < count) {
    throw createError({ statusCode: 400, message: `Insufficient stock in pile. Available: ${available}` });
  }

  const baseLineage = inheritLineage(pileRaw, 'pile');
  const created = [];

  for (let i = 0; i < count; i++) {
    const serial = `SH-${generateRandomString(8)}`;
    const sheet = new Sheet({
      identity: { uid: `sheet-${generateRandomString(8)}`, serial, name: `Sheet ${serial}` },
      lineage: baseLineage,
      data: { serial, specs: pileRaw.data.specs || {} }
    });
    
    sheet.applyStatus('AVAILABLE', userId, { note: 'Created from material pile' });
    const createdRaw = await repository.create(sheet);
    created.push(new Sheet(createdRaw));
  }

  await materialPilesRepository.updateById(pileId, { 
    'data.stock.used': (pileRaw.data?.stock?.used || 0) + count 
  });

  return created;
}

export async function allocateFromPile(pileId, count, user) {
  const userPermissions = { memberships: user.memberships };
  return await createFromPile(pileId, count, user.userId, user.role, userPermissions);
}

export async function createCutSheetFromPile(pileId, { queue, run, source = {}, index = 0, userId = 'SYSTEM' } = {}) {
  const pileRaw = await materialPilesRepository.findById(pileId);
  if (!pileRaw) throw createError({ statusCode: 404, message: 'Material pile not found' });

  const serial = `CUT-${generateRandomString(8)}`;
  const lineage = inheritLineage(pileRaw, 'pile')
    .add('queue', queue?._id)
    .add('run', run?._id);
  if (queue?.lineage?.projectId) lineage.projectId = queue.lineage.projectId;

  const specs = pileRaw.specs || pileRaw.data?.specs || source.dimensions || {};
  const sheet = new Sheet({
    identity: { uid: `sheet-${generateRandomString(8)}`, serial, name: `Cut sheet ${index + 1}` },
    lineage,
    specs,
    data: {
      serial,
      specs,
      source: 'QUEUE_CUT',
      materialSource: {
        type: 'PILE',
        id: pileId,
        label: source.label || pileRaw.identity?.name || pileId
      },
      queueId: queue?._id?.toString?.() || queue?._id,
      runId: run?._id?.toString?.() || run?._id
    }
  });

  sheet.applyStatus('MILLED', userId, { note: 'Consumed by queue cut' });
  const createdRaw = await repository.create(sheet);
  return new Sheet(createdRaw).toJSON();
}

export async function list(userId, userOrg, userRole, userPermissions, filter = {}) {
  const lineageFilter = getLineageFilter(userPermissions);
  const finalFilter = mapLineageQuery({ ...lineageFilter, ...filter });
  const raws = await repository.find(finalFilter);
  return raws.map(raw => new Sheet(raw));
}

export async function getById(uid) {
  const raw = await repository.findById(uid);
  if (!raw) return null;
  return new Sheet(raw);
}

export async function update(uid, updates, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(uid);
  if (!raw) throw createError({ statusCode: 404, message: 'Sheet not found' });
  const sheet = new Sheet(raw);
  
  if (!hasLineagePermission(userPermissions, sheet.lineage, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  if (updates.status) {
    await statusService.transition('sheet', sheet._id, updates.status, userId, createTransitionAuth(userId, userRole, userPermissions), updates.statusMeta || {});
    return await getById(uid);
  }

  const { identity, origin, status, lineage, data: updatesData, ...clean } = updates;
  
  sheet.data = {
    ...sheet.data,
    ...updatesData,
    ...clean
  };

  await repository.updateById(uid, sheet);
  const updatedRaw = await repository.findById(uid);
  return new Sheet(updatedRaw);
}

export async function remove(uid, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(uid);
  if (!raw) throw createError({ statusCode: 404, message: 'Sheet not found' });
  
  if (!hasLineagePermission(userPermissions, raw.lineage, 'materials', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  if (raw.status?.state === 'MILLED') {
    throw createError({ statusCode: 400, message: 'Cannot delete milled sheet' });
  }
  
  return await repository.deleteById(uid);
}

export async function finishMilling(uid, cassetteInstanceIds = [], remnantIds = [], user = {}) {
  const raw = await repository.findById(uid);
  if (!raw) throw createError({ statusCode: 404, message: 'Sheet not found' });

  const currentState = raw.status?.state;
  if (currentState !== 'IN-CUTTING' && currentState !== 'in_cutting') {
    throw createError({ statusCode: 400, message: 'Sheet must be in cutting status' });
  }

  const sheet = new Sheet(raw);
  sheet.data = {
    ...sheet.data,
    cassetteInstanceIds,
    remnantIds
  };
  sheet.applyStatus('MILLED', user.userId || 'SYSTEM', { note: 'Milling completed' });

  await repository.updateById(uid, sheet);

  const warehouseId = raw.lineage?.warehouseId;
  if (warehouseId) {
    const { updateInventoryCounts } = await import('../warehouses/service.js');
    await updateInventoryCounts(warehouseId, {
      totalSheets: -1,
      totalRemnants: remnantIds.length
    });
  }

  return await getById(uid);
}
