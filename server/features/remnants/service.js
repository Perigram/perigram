import * as repository from './repository.js';
import * as warehouseService from '../warehouses/service.js';
import { createError } from 'h3';
import { hasPermission } from '~/server/utils/auth-helpers';
import { ObjectId } from 'mongodb';

export async function create(data, user) {
  if (!hasPermission(user, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  // Validate required fields
  if (!data.sheetId || !data.warehouseId || !data.geometryDxf) {
    throw createError({ statusCode: 400, message: 'SheetId, warehouseId, and geometryDxf required' });
  }
  
  // Verify access to warehouse
  await warehouseService.getById(data.warehouseId, user);
  
  // Generate remnant number
  const remnantNumber = await repository.getNextRemnantNumber();
  
  // Calculate if reusable (e.g., area > 0.1 m²)
  const minReusableArea = 0.1; // 0.1 m² = 100,000 mm²
  const isReusable = (data.area || 0) >= minReusableArea;
  
  const remnant = await repository.create({
    remnantNumber,
    sheetId: new ObjectId(data.sheetId),
    warehouseId: new ObjectId(data.warehouseId),
    material: data.material,
    color: data.color,
    thickness: data.thickness,
    foilThickness: data.foilThickness || 0,
    geometryDxf: data.geometryDxf,
    area: data.area || 0,
    width: data.width || 0,
    height: data.height || 0,
    qrCode: data.qrCode || '',
    isReusable,
    status: 'in_stock',
    usedInQueueId: null,
    createdBy: user.userId
  });
  
  // Update warehouse remnant count (handled by sheets.finishMilling)
  // await warehouseService.updateInventoryCounts(data.warehouseId, { totalRemnants: 1 });
  
  return remnant;
}

export async function createMany(remnantsData, user) {
  if (!hasPermission(user, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  const minReusableArea = 0.1;
  const remnants = [];
  
  for (const data of remnantsData) {
    const remnantNumber = `REM-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const isReusable = (data.area || 0) >= minReusableArea;
    
    remnants.push({
      remnantNumber,
      sheetId: new ObjectId(data.sheetId),
      warehouseId: new ObjectId(data.warehouseId),
      material: data.material,
      color: data.color,
      thickness: data.thickness,
      foilThickness: data.foilThickness || 0,
      geometryDxf: data.geometryDxf,
      area: data.area || 0,
      width: data.width || 0,
      height: data.height || 0,
      qrCode: data.qrCode || '',
      isReusable,
      status: 'in_stock',
      usedInQueueId: null,
      createdBy: user.userId,
      createdAt: new Date()
    });
  }
  
  if (remnants.length > 0) {
    await repository.createMany(remnants);
  }
  
  return remnants;
}

export async function list(user, filter = {}) {
  // Filter by accessible warehouses
  const warehouses = await warehouseService.list(user);
  const warehouseIds = warehouses.map(w => w._id);
  filter.warehouseId = { $in: warehouseIds };
  
  return await repository.find(filter);
}

export async function searchReusable(user, filter = {}) {
  // Get reusable remnants for nesting
  const warehouses = await warehouseService.list(user);
  const warehouseIds = warehouses.map(w => w._id);
  filter.warehouseId = { $in: warehouseIds };
  
  return await repository.findReusable(filter);
}

export async function getById(id, user) {
  const remnant = await repository.findById(id);
  if (!remnant) {
    throw createError({ statusCode: 404, message: 'Remnant not found' });
  }
  
  // Verify access to warehouse
  await warehouseService.getById(remnant.warehouseId.toString(), user);
  
  return remnant;
}

export async function update(id, updates, user) {
  const remnant = await repository.findById(id);
  if (!remnant) {
    throw createError({ statusCode: 404, message: 'Remnant not found' });
  }
  
  // Verify access to warehouse
  await warehouseService.getById(remnant.warehouseId.toString(), user);
  
  if (!hasPermission(user, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  // Don't allow changing critical fields
  delete updates.remnantNumber;
  delete updates.sheetId;
  delete updates.warehouseId;
  delete updates.geometryDxf;
  delete updates.status;
  
  const success = await repository.updateById(id, updates);
  if (!success) {
    throw createError({ statusCode: 500, message: 'Update failed' });
  }
  
  return await repository.findById(id);
}

export async function markAsUsed(id, queueId, user) {
  const remnant = await repository.findById(id);
  if (!remnant) {
    throw createError({ statusCode: 404, message: 'Remnant not found' });
  }
  
  // Verify access to warehouse
  await warehouseService.getById(remnant.warehouseId.toString(), user);
  
  if (!hasPermission(user, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  if (remnant.status !== 'in_stock') {
    throw createError({ statusCode: 409, message: 'Remnant already used' });
  }
  
  await repository.updateById(id, {
    status: 'used',
    usedInQueueId: new ObjectId(queueId)
  });
  
  // Update warehouse count
  await warehouseService.updateInventoryCounts(remnant.warehouseId.toString(), { totalRemnants: -1 });
  
  return await repository.findById(id);
}

export async function remove(id, user) {
  if (!hasPermission(user, 'materials', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  const remnant = await repository.findById(id);
  if (!remnant) {
    throw createError({ statusCode: 404, message: 'Remnant not found' });
  }
  
  // Verify access
  await warehouseService.getById(remnant.warehouseId.toString(), user);
  
  // Can't delete if used
  if (remnant.status === 'used') {
    throw createError({ statusCode: 409, message: 'Cannot delete used remnant' });
  }
  
  const success = await repository.deleteById(id);
  if (!success) {
    throw createError({ statusCode: 404, message: 'Remnant not found' });
  }
  
  // Update warehouse count
  await warehouseService.updateInventoryCounts(remnant.warehouseId.toString(), { totalRemnants: -1 });
  
  return { success: true };
}
