import * as repository from './repository.js';
import * as materialPilesRepository from '../material-piles/repository.js';
import { createError } from 'h3';
import { hasLineagePermission, getLineageFilter } from '~/server/utils/permissions';
import { createStatus, inheritLineage } from '~/server/utils/blocks';
import { statusService } from '~/server/core/machines/service';
import { ObjectId } from 'mongodb';

/**
 * Sheets Service - v24 Standardized
 */

export async function createFromPile(pileId, count, userId, userRole, userPermissions) {
  const pile = await materialPilesRepository.findById(pileId);
  if (!pile) {
    throw createError({ statusCode: 404, message: 'Material pile not found' });
  }

  // 1. Permission Check
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, pile.lineage, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  // 2. Stock Check
  const available = pile.stock.total - pile.stock.used;
  if (available < count) {
    throw createError({ statusCode: 400, message: `Insufficient stock in pile. Available: ${available}` });
  }

  // 3. Lineage Inheritance
  const baseLineage = inheritLineage(pile, 'pile');

  const sheetsToCreate = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const serial = `SH-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
    const origin = createStatus('AVAILABLE', userId, { note: 'Created from material pile' });
    
    sheetsToCreate.push({
      identity: { serial, name: `Sheet ${serial}` },
      origin,
      status: origin,
      lineage: baseLineage,
      specs: {} // Optional overrides
    });
  }

  const created = [];
  for (const sheetData of sheetsToCreate) {
    const sheet = await repository.create(sheetData);
    created.push(sheet);
  }

  // 4. Update Pile Stock
  await materialPilesRepository.updateById(pileId, { 
    'stock.used': pile.stock.used + count 
  });

  return created;
}

export async function list(userId, userOrg, userRole, userPermissions, options = {}) {
  const filter = getLineageFilter({ memberships: userPermissions.memberships, role: userRole });
  return await repository.find(filter);
}

export async function getById(id, userId, userOrg, userRole, userPermissions) {
  const sheet = await repository.findById(id);
  if (!sheet) {
    throw createError({ statusCode: 404, message: 'Sheet not found' });
  }
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, sheet.lineage, 'materials', 'read')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  return sheet;
}

export async function update(id, updates, userId, userOrg, userRole, userPermissions) {
  const sheet = await getById(id, userId, userOrg, userRole, userPermissions);
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, sheet.lineage, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  // Status updates must go through statusService
  if (updates.status) {
    await statusService.transition('sheet', sheet._id, updates.status, userId, userRole, updates.statusMeta || {});
    delete updates.status;
  }

  const { identity, origin, status, lineage, specs, ...clean } = updates;
  
  // Identity updates
  if (updates.serial) sheet.identity.serial = updates.serial;
  if (updates.name) sheet.identity.name = updates.name;

  await repository.updateById(id, { identity: sheet.identity, ...clean });
  return await repository.findById(id);
}

export async function remove(id, userId, userOrg, userRole, userPermissions) {
  const sheet = await getById(id, userId, userOrg, userRole, userPermissions);
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, sheet.lineage, 'materials', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  // Logic: Can't delete if already MILLED
  if (sheet.status.state === 'MILLED') {
    throw createError({ statusCode: 400, message: 'Cannot delete milled sheet' });
  }
  
  return await repository.deleteById(id);
}
