import * as repository from './repository.js';
import * as materialPilesRepository from '../material-piles/repository.js';
import { createError } from 'h3';
import { hasLineagePermission, getLineageFilter } from '~/server/utils/permissions';
import { createStatus, inheritLineage } from '~/server/utils/blocks';
import { statusService } from '~/server/core/machines/service';
import { ObjectId } from 'mongodb';
import { toObjectId, isValidObjectId } from '~/server/utils/objectid';

/**
 * Sheets Service - v24 Standardized
 */

function toDTO(sheet) {
  if (!sheet) return null;
  return {
    ...sheet,
    name: sheet.identity?.name || sheet.name,
    serial: sheet.identity?.serial || sheet.serial
  };
}

export async function createFromPile(pileId, count, userId, userRole, userPermissions) {
  const pile = await materialPilesRepository.findById(pileId);
  if (!pile) throw createError({ statusCode: 404, message: 'Material pile not found' });

  if (!hasLineagePermission(userPermissions, pile.lineage, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const available = (pile.stock?.total || 0) - (pile.stock?.used || 0);
  if (available < count) {
    throw createError({ statusCode: 400, message: `Insufficient stock in pile. Available: ${available}` });
  }

  const baseLineage = inheritLineage(pile, 'pile');
  const sheetsToCreate = [];

  for (let i = 0; i < count; i++) {
    const serial = `SH-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
    const origin = createStatus('AVAILABLE', userId, { note: 'Created from material pile' });
    
    sheetsToCreate.push({
      identity: { serial, name: `Sheet ${serial}` },
      origin,
      status: origin,
      lineage: baseLineage,
      specs: { ...pile.specs }
    });
  }

  const created = [];
  for (const sheetData of sheetsToCreate) {
    const sheet = await repository.create(sheetData);
    created.push(toDTO(sheet));
  }

  await materialPilesRepository.updateById(pileId, { 
    'stock.used': (pile.stock?.used || 0) + count 
  });

  return created;
}

export async function list(userId, userOrg, userRole, userPermissions, filter = {}) {
  const lineageFilter = getLineageFilter(userPermissions);
  const finalFilter = { ...lineageFilter };
  
  if (filter.warehouseId && isValidObjectId(filter.warehouseId)) finalFilter['lineage.warehouseId'] = toObjectId(filter.warehouseId);
  if (filter.pileId && isValidObjectId(filter.pileId)) finalFilter['lineage.pileId'] = toObjectId(filter.pileId);
  if (filter.organizationId && isValidObjectId(filter.organizationId)) finalFilter['lineage.organizationId'] = toObjectId(filter.organizationId);

  const sheets = await repository.find(finalFilter);
  return sheets.map(toDTO);
}

export async function getById(id, userId, userOrg, userRole, userPermissions) {
  const sheet = await repository.findById(id);
  if (!sheet) throw createError({ statusCode: 404, message: 'Sheet not found' });
  
  if (!hasLineagePermission(userPermissions, sheet.lineage, 'materials', 'read')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  return toDTO(sheet);
}

export async function update(id, updates, userId, userOrg, userRole, userPermissions) {
  const sheet = await repository.findById(id);
  if (!sheet) throw createError({ statusCode: 404, message: 'Sheet not found' });
  
  if (!hasLineagePermission(userPermissions, sheet.lineage, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  if (updates.status) {
    await statusService.transition('sheet', sheet._id, updates.status, userId, userRole, updates.statusMeta || {});
    delete updates.status;
  }

  const { identity, origin, status, lineage, specs, ...clean } = updates;
  
  if (updates.serial) sheet.identity.serial = updates.serial;
  if (updates.name) sheet.identity.name = updates.name;

  await repository.updateById(id, { identity: sheet.identity, ...clean });
  const updated = await repository.findById(id);
  return toDTO(updated);
}

export async function remove(id, userId, userOrg, userRole, userPermissions) {
  const sheet = await repository.findById(id);
  if (!sheet) throw createError({ statusCode: 404, message: 'Sheet not found' });
  
  if (!hasLineagePermission(userPermissions, sheet.lineage, 'materials', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  if (sheet.status?.state === 'MILLED') {
    throw createError({ statusCode: 400, message: 'Cannot delete milled sheet' });
  }
  
  return await repository.deleteById(id);
}
