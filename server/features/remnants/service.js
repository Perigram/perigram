import * as repository from './repository.js';
import * as warehouseService from '../warehouses/service.js';
import * as sheetsRepository from '../sheets/repository.js'; 
import { createError } from 'h3';
import { hasLineagePermission, getLineageFilter } from '~/server/utils/permissions';
import { createIdentity, createStatus, inheritLineage, createData, createAttachment } from '~/server/core/blocks/index.js';
import { statusService } from '~/server/core/machines/service';
import { mapLineageQuery } from '~/server/utils/query';
import { ObjectId } from 'mongodb';

/**
 * Remnants Service - v24 Standardized
 */

function toDTO(remnant) {
  if (!remnant) return null;
  return {
    ...remnant,
    ...remnant.data,
    name: remnant.identity?.name,
    serial: remnant.identity?.serial
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
    data: createData({
      geometry: {
        data: data.geometryData || null
      },
      attachment: data.geometryDxf ? createAttachment('DXF', data.geometryDxf, `Remnant ${remnantNumber} DXF`) : null,
      specs: {
        area: data.area || 0,
        width: data.width || 0,
        height: data.height || 0,
        thickness: data.thickness || parentSheet?.data?.specs?.thickness || parentSheet?.specs?.thickness || 0,
        material: data.material || parentSheet?.data?.specs?.material || parentSheet?.specs?.material || null,
        color: data.color || parentSheet?.data?.specs?.color || parentSheet?.specs?.color || null
      },
      isReusable
    })
  };

  const remnant = await repository.create(remnantData);
  return toDTO(remnant);
}

export async function list(userId, userOrg, userRole, userPermissions, filter = {}) {
  const lineageFilter = getLineageFilter({ memberships: userPermissions.memberships, role: userRole });
  const rawFilter = { ...lineageFilter, ...filter };
  
  // Use centralized mapper for ID -> Lineage
  const finalFilter = mapLineageQuery(rawFilter);

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

  const { identity, origin, status, lineage, data: updatesData, ...clean } = updates;

  if (updates.name) remnant.identity.name = updates.name;

  const remnantData = {
    ...remnant.data,
    ...updatesData,
    ...clean
  };

  await repository.updateById(id, { identity: remnant.identity, data: remnantData });
  const updated = await repository.findById(id);
  return toDTO(updated);
}

export async function searchReusable(userId, organizationId, userRole, userPermissions) {
  const filter = {
    ...getLineageFilter({ memberships: userPermissions.memberships, role: userRole }),
    isReusable: true,
    'status.state': 'AVAILABLE'
  };
  const remnants = await repository.find(filter);
  return remnants.map(toDTO);
}

export async function remove(id, userId, userOrg, userRole, userPermissions) {
  const remnant = await getById(id, userId, userOrg, userRole, userPermissions);
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, remnant.lineage, 'materials', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  return await repository.deleteById(id);
}
