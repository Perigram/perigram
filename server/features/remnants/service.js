import * as repository from './repository.js';
import { createProcessUpdateHandler } from '../_template/process-update-handler.js';
import * as warehouseService from '../warehouses/service.js';
import * as sheetsRepository from '../sheets/repository.js'; 
import { createError } from 'h3';
import { hasLineagePermission, getLineageFilter } from '~/server/utils/permissions';
import { createIdentity, inheritLineage, createData, createAttachment } from '~/server/core/blocks/index.js';
import { createTransitionAuth, statusService } from '~/server/core/machines/service';
import { mapLineageQuery } from '~/server/utils/query';
import { ObjectId } from 'mongodb';
import { Remnant } from './model.js';

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
  if (!hasLineagePermission(userPermissions, lineage, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const remnantNumber = await repository.getNextRemnantNumber();
  const origin = await statusService.initialStatusForOrganization(
    'remnant',
    lineage.organizationId,
    userId,
    { note: 'Remnant created' }
  );
  
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
      source: data.source || null,
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
  const lineageFilter = getLineageFilter(userPermissions);
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
  
  if (!hasLineagePermission(userPermissions, remnant.lineage, 'materials', 'read')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  return toDTO(remnant);
}

export async function update(id, updates, userId, userOrg, userRole, userPermissions) {
  const remnant = await repository.findById(id); // Raw for permission
  if (!remnant) throw createError({ statusCode: 404, message: 'Remnant not found' });
  
  if (!hasLineagePermission(userPermissions, remnant.lineage, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  if (updates.status) {
    await statusService.transition('remnant', remnant._id, updates.status, userId, createTransitionAuth(userId, userRole, userPermissions), updates.statusMeta || {});
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
    ...getLineageFilter(userPermissions),
    'data.isReusable': true
  };
  const remnants = await repository.find(filter);
  return remnants.map(toDTO);
}

export async function createFromCutSheet(sheet, { area = 0, width = 0, height = 0, geometryData = null, index = 0, userId = 'SYSTEM' } = {}) {
  const lineage = sheet.data?.virtualSource
    ? { ...(sheet.lineage || {}) }
    : inheritLineage(sheet, 'sheet');
  const specs = sheet.specs || sheet.data?.specs || {};
  const remnantNumber = await repository.getNextRemnantNumber();
  const origin = await statusService.initialStatusForOrganization(
    'remnant',
    lineage.organizationId,
    userId,
    { note: 'Created from queue cut' }
  );
  const isReusable = Number(area || 0) >= 0.1;
  const remnantData = {
    identity: createIdentity(`Remnant ${remnantNumber}`, remnantNumber, `${remnantNumber}-${index + 1}`),
    origin,
    status: origin,
    lineage,
    data: createData({
      source: 'QUEUE_CUT',
      geometry: { data: geometryData },
      specs: {
        area: Number(area || 0),
        width: Number(width || 0),
        height: Number(height || 0),
        thickness: specs.sheetThickness || specs.thickness || 0,
        material: specs.material || null,
        color: specs.color || null
      },
      isReusable
    })
  };

  const remnant = await repository.create(remnantData);
  if (lineage.warehouseId) {
    await warehouseService.updateInventoryCounts(lineage.warehouseId, { totalRemnants: 1 });
  }
  return toDTO(remnant);
}

export async function remove(id, userId, userOrg, userRole, userPermissions) {
  const remnant = await getById(id, userId, userOrg, userRole, userPermissions);
  
  if (!hasLineagePermission(userPermissions, remnant.lineage, 'materials', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  return await repository.deleteById(id);
}

export async function markAsUsed(id, queueId, user) {
  const remnant = await repository.findById(id);
  if (!remnant) throw createError({ statusCode: 404, message: 'Remnant not found' });

  const data = {
    ...(remnant.data || {}),
    usedInQueueId: queueId,
    isReusable: false
  };
  await statusService.transitionWithResult({
    entityType: 'remnant',
    targetId: id,
    intent: 'consumeRemnant',
    auth: createTransitionAuth(user?.userId || 'SYSTEM', user?.role, user),
    context: { metadata: { note: 'Remnant used in queue', queueId } },
    patch: { data }
  });

  const warehouseId = remnant.lineage?.warehouseId || remnant.warehouseId;
  if (warehouseId) {
    await warehouseService.updateInventoryCounts(warehouseId, { totalRemnants: -1 });
  }

  const updated = await repository.findById(id);
  return toDTO(updated);
}

export const processUpdate = createProcessUpdateHandler({
  entityType: 'remnant',
  repository,
  Model: Remnant
});
