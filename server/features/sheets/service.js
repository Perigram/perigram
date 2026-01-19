import * as repository from './repository.js';
import * as batchService from '../material-batches/service.js';
import * as warehouseService from '../warehouses/service.js';
import { createError } from 'h3';
import { hasPermission } from '~/server/utils/auth-helpers';
import { checkEntityAccess } from '~/server/utils/permissions';
import { connectDB } from '~/server/db/mongo';
import { ObjectId } from 'mongodb';

export async function allocateFromBatch(batchId, pileId, count, user) {
  if (!hasPermission(user, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  // Use transaction to allocate sheets
  const result = await batchService.allocateSheets(batchId, pileId, count, user.userId);
  
  // Create sheets from allocated data
  const db = await connectDB();
  const session = db.client.startSession();
  
  try {
    let createdSheets = [];
    
    await session.withTransaction(async () => {
      const sheetsToCreate = [];
      
      for (let i = 0; i < count; i++) {
        const sheetNumber = `SH-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        sheetsToCreate.push({
          sheetNumber,
          ...result.sheets[i],
          status: 'in_stock',
          history: [{
            action: 'allocated',
            timestamp: new Date(),
            userId: user.userId,
            operatorType: 'warehouse',
            note: `Allocated from batch ${batchId}`
          }],
          queueId: null,
          cassetteInstanceIds: [],
          remnantIds: [],
          createdBy: user.userId,
          createdAt: new Date()
        });
      }
      
      await db.collection('sheets').insertMany(sheetsToCreate, { session });
      createdSheets = sheetsToCreate;
      
      // Update warehouse sheet count
      const warehouseId = result.sheets[0].warehouseId.toString();
      await db.collection('warehouses').updateOne(
        { _id: new ObjectId(warehouseId) },
        { $inc: { totalSheets: count } },
        { session }
      );
    });
    
    return createdSheets;
  } finally {
    await session.endSession();
  }
}

export async function list(user, filter = {}) {
  // Filter by accessible warehouses
  const warehouses = await warehouseService.list(user);
  const warehouseIds = warehouses.map(w => w._id);
  filter.warehouseId = { $in: warehouseIds };
  
  return await repository.find(filter);
}

export async function getById(id, user) {
  const sheet = await repository.findById(id);
  if (!sheet) {
    throw createError({ statusCode: 404, message: 'Sheet not found' });
  }
  
  // Verify access to warehouse
  await warehouseService.getById(sheet.warehouseId.toString(), user);
  
  return sheet;
}

export async function update(id, updates, user) {
  const sheet = await repository.findById(id);
  if (!sheet) {
    throw createError({ statusCode: 404, message: 'Sheet not found' });
  }
  
  // Verify access to warehouse
  await warehouseService.getById(sheet.warehouseId.toString(), user);
  
  if (!hasPermission(user, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  // Don't allow changing critical fields
  delete updates.sheetNumber;
  delete updates.batchId;
  delete updates.pileId;
  delete updates.warehouseId;
  delete updates.status;
  delete updates.history;
  
  const success = await repository.updateById(id, updates);
  if (!success) {
    throw createError({ statusCode: 500, message: 'Update failed' });
  }
  
  return await repository.findById(id);
}

export async function updateStatus(id, newStatus, note, user, operatorType = 'manual') {
  const sheet = await repository.findById(id);
  if (!sheet) {
    throw createError({ statusCode: 404, message: 'Sheet not found' });
  }
  
  // Verify access
  await warehouseService.getById(sheet.warehouseId.toString(), user);
  
  if (!hasPermission(user, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  // Validate status
  const validStatuses = ['in_stock', 'in_cutting', 'milled'];
  if (!validStatuses.includes(newStatus)) {
    throw createError({ statusCode: 400, message: 'Invalid status' });
  }
  
  await repository.updateById(id, { status: newStatus });
  await repository.addHistory(id, {
    action: `status_changed_to_${newStatus}`,
    timestamp: new Date(),
    userId: user.userId,
    operatorType,
    note: note || ''
  });
  
  return await repository.findById(id);
}

export async function markForCutting(sheetIds, queueId, user) {
  if (!hasPermission(user, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  const db = await connectDB();
  const updatedCount = await db.collection('sheets').updateMany(
    { 
      _id: { $in: sheetIds.map(id => new ObjectId(id)) },
      status: 'in_stock'
    },
    { 
      $set: { 
        status: 'in_cutting',
        queueId: new ObjectId(queueId),
        updatedAt: new Date()
      },
      $push: {
        history: {
          action: 'marked_for_cutting',
          timestamp: new Date(),
          userId: user.userId,
          operatorType: 'queue',
          note: `Assigned to queue ${queueId}`
        }
      }
    }
  );
  
  return updatedCount.modifiedCount;
}

export async function finishMilling(sheetId, cassetteInstanceIds, remnantIds, user) {
  const sheet = await repository.findById(sheetId);
  if (!sheet) {
    throw createError({ statusCode: 404, message: 'Sheet not found' });
  }
  
  if (sheet.status !== 'in_cutting') {
    throw createError({ statusCode: 409, message: 'Sheet must be in cutting status' });
  }
  
  // Update sheet to milled
  await repository.updateById(sheetId, {
    status: 'milled',
    cassetteInstanceIds: cassetteInstanceIds.map(id => new ObjectId(id)),
    remnantIds: remnantIds.map(id => new ObjectId(id))
  });
  
  await repository.addHistory(sheetId, {
    action: 'milled',
    timestamp: new Date(),
    userId: user.userId,
    operatorType: 'cnc',
    note: `Created ${cassetteInstanceIds.length} cassettes and ${remnantIds.length} remnants`
  });
  
  // Update warehouse count (sheet consumed)
  await warehouseService.updateInventoryCounts(sheet.warehouseId.toString(), { 
    totalSheets: -1,
    totalRemnants: remnantIds.length
  });
  
  return await repository.findById(sheetId);
}

export async function remove(id, user) {
  if (!hasPermission(user, 'materials', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  const sheet = await repository.findById(id);
  if (!sheet) {
    throw createError({ statusCode: 404, message: 'Sheet not found' });
  }
  
  // Verify access
  await warehouseService.getById(sheet.warehouseId.toString(), user);
  
  // Can't delete if used in cutting or milled
  if (sheet.status !== 'in_stock') {
    throw createError({ statusCode: 409, message: 'Cannot delete sheet that is not in stock' });
  }
  
  const success = await repository.deleteById(id);
  if (!success) {
    throw createError({ statusCode: 404, message: 'Sheet not found' });
  }
  
  // Update warehouse count
  await warehouseService.updateInventoryCounts(sheet.warehouseId.toString(), { totalSheets: -1 });
  
  return { success: true };
}
