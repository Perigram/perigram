import * as repository from './repository.js';
import * as materialPilesService from '../material-piles/service.js';
import { createError } from 'h3';
import { hasLineagePermission, getLineageFilter } from '~/server/utils/permissions';
import { inheritLineage, registerService } from '~/server/utils/blocks';
import { Sheet } from './model.js';
import { statusService } from '~/server/core/machines/service';
import { generateRandomString } from '~/server/utils/strings';

/**
 * Sheets Service - v24 Absolute Final
 */

registerService('sheet', {
  getById: (uid) => getById(uid)
});

export async function createFromPile(pileId, count, userId, userRole, userPermissions) {
  const pile = await materialPilesService.getById(pileId);
  if (!pile) throw createError({ statusCode: 404, message: 'Material pile not found' });

  if (!hasLineagePermission(userPermissions, pile.lineage, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const stock = pile.data.stock;
  const available = (stock.total || 0) - (stock.used || 0);
  if (available < count) {
    throw createError({ statusCode: 400, message: `Insufficient stock in pile. Available: ${available}` });
  }

  const sheetsToCreate = [];
  for (let i = 0; i < count; i++) {
    const serial = `SH-${Date.now()}-${generateRandomString(5).toUpperCase()}`;
    const uid = `sheet-${generateRandomString(8)}`;
    
    // Standard: Sheet inherits ONLY lineage from pile. No specs or serial copying.
    const sheet = new Sheet({
      identity: { uid },
      lineage: inheritLineage(pile, 'pile'),
      params: { serial } // Local identifier for the physical unit
    });

    sheet.applyStatus('AVAILABLE', userId, { note: 'Created from material pile' });
    sheetsToCreate.push(sheet);
  }

  const created = [];
  for (const sheet of sheetsToCreate) {
    const raw = await repository.create(sheet);
    created.push(new Sheet(raw));
  }

  // Orchestrate pile allocation
  await materialPilesService.allocate(pileId, count, userId, userRole);

  return created;
}

export async function list(userId, userOrg, userRole, userPermissions, filter = {}) {
  const lineageFilter = getLineageFilter(userPermissions);
  const raws = await repository.find({ ...lineageFilter, ...filter });
  return raws.map(raw => new Sheet(raw));
}

export async function getById(uid) {
  const raw = await repository.findById(uid);
  if (!raw) return null;
  return new Sheet(raw);
}

export async function update(uid, updates, userId, userOrg, userRole, userPermissions) {
  const sheetRaw = await repository.findById(uid);
  if (!sheetRaw) throw createError({ statusCode: 404, message: 'Sheet not found' });
  const sheet = new Sheet(sheetRaw);
  
  if (!hasLineagePermission(userPermissions, sheet.lineage, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  if (updates.status) {
    await statusService.transition('sheet', sheet._id, updates.status, userId, userRole, updates.statusMeta || {});
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
  const sheet = await getById(uid);
  if (!sheet) throw createError({ statusCode: 404, message: 'Sheet not found' });
  
  if (!hasLineagePermission(userPermissions, sheet.lineage, 'materials', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  return await repository.deleteById(uid);
}