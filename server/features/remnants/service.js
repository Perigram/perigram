import * as repository from './repository.js';
import * as warehouseService from '../warehouses/service.js';
import * as sheetsRepository from '../sheets/repository.js'; 
import { createError } from 'h3';
import { hasLineagePermission, getLineageFilter } from '~/server/utils/permissions';
import { createIdentity, createStatus, inheritLineage } from '~/server/utils/blocks';
import { statusService } from '~/server/core/machines/service';
import { ObjectId } from 'mongodb';

/**
 * Remnants Service - v24 Standardized
 */

function toDTO(remnant) {
  if (!remnant) return null;
  return {
    ...remnant,
    name: remnant.identity?.name || remnant.name,
    serial: remnant.identity?.serial || remnant.serial
  };
}

export async function create(data, userId, userOrg, userRole, userPermissions) {
  // data: { sheetId? (optional parent), warehouseId (required if no sheet), geometryDxf, area, width, height, ... }

  let lineage;
  let parentSheet = null;

  if (data.sheetId) {
    parentSheet = await sheetsRepository.findById(data.sheetId);
    if (!parentSheet) throw createError({ statusCode: 404, message: 'Parent sheet not found' });
    
    // Inherit from sheet
    lineage = inheritLineage(parentSheet, 'sheet'); // { ...sheet.lineage, sheetId: ... }
  } else if (data.warehouseId) {
    const warehouse = await warehouseService.getById(data.warehouseId, userId, userOrg, userRole, userPermissions);
    // Inherit from warehouse
    lineage = inheritLineage(warehouse, 'warehouse');
  } else {
    throw createError({ statusCode: 400, message: 'Either sheetId or warehouseId is required' });
  }

  // Permission Check
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, lineage, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const remnantNumber = await repository.getNextRemnantNumber();
  const origin = createStatus('AVAILABLE', userId, { note: 'Remnant created' });
  
  // Calculate if reusable
  const minReusableArea = 0.1; // Could be from settings
  const isReusable = (data.area || 0) >= minReusableArea;

  const remnantData = {
    identity: createIdentity(`Remnant ${remnantNumber}`, remnantNumber),
    origin,
    status: origin,
    lineage,
    geometry: {
      dxfId: data.geometryDxf ? new ObjectId(data.geometryDxf) : null,
      data: data.geometryData || null
    },
    specs: {
      area: data.area || 0,
      width: data.width || 0,
      height: data.height || 0,
      thickness: data.thickness || parentSheet?.specs?.thickness || 0,
      material: data.material || parentSheet?.specs?.material || null,
      color: data.color || parentSheet?.specs?.color || null
    },
    isReusable
  };

  const remnant = await repository.create(remnantData);
  
  // Update inventory if needed (handled via status hooks or separate service call usually)
  // For now, keeping it simple as per V24
  
  return toDTO(remnant);
}

export async function list(userId, userOrg, userRole, userPermissions, filter = {}) {
  const lineageFilter = getLineageFilter({ memberships: userPermissions.memberships, role: userRole });
  const finalFilter = { ...lineageFilter, ...filter };
  
  // Map legacy/direct ID filters to lineage
  if (finalFilter.warehouseId) {
    finalFilter['lineage.warehouseId'] = new ObjectId(finalFilter.warehouseId);
    delete finalFilter.warehouseId;
  }
  if (finalFilter.sheetId) {
    finalFilter['lineage.sheetId'] = new ObjectId(finalFilter.sheetId);
    delete finalFilter.sheetId;
  }
  if (finalFilter.pileId) {
    finalFilter['lineage.pileId'] = new ObjectId(finalFilter.pileId);
    delete finalFilter.pileId;
  }

  // Handle reusable flag if passed
  if (finalFilter.isReusable !== undefined) {
      // boolean check
  }

  const remnants = await repository.find(finalFilter);
  return remnants.map(toDTO);
}

export async function getById(id, userId, userOrg, userRole, userPermissions) {
  if (!ObjectId.isValid(id)) throw createError({ statusCode: 400, message: 'Invalid ID' });
  
  const remnant = await repository.findById(id);
  if (!remnant) throw createError({ statusCode: 404, message: 'Remnant not found' });
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, remnant.lineage, 'materials', 'read')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  return toDTO(remnant);
}

export async function update(id, updates, userId, userOrg, userRole, userPermissions) {
  const remnant = await repository.findById(id); // Raw for permission
  if (!remnant) throw createError({ statusCode: 404, message: 'Remnant not found' });
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, remnant.lineage, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  if (updates.status) {
    await statusService.transition('remnant', remnant._id, updates.status, userId, userRole, updates.statusMeta || {});
    delete updates.status;
  }

  const { identity, origin, status, lineage, specs, geometry, ...clean } = updates;

  if (updates.name) remnant.identity.name = updates.name;

  await repository.updateById(id, { identity: remnant.identity, ...clean });
  const updated = await repository.findById(id);
  return toDTO(updated);
}

export async function remove(id, userId, userOrg, userRole, userPermissions) {
  const remnant = await getById(id, userId, userOrg, userRole, userPermissions);
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, remnant.lineage, 'materials', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  return await repository.deleteById(id);
}
