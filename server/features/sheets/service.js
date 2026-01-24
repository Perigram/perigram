import * as repository from './repository.js';
import * as batchService from '../material-batches/service.js';
import * as warehouseService from '../warehouses/service.js';
import { createError } from 'h3';
import { hasPermission } from '~/server/utils/auth-helpers';
import { checkEntityAccess } from '~/server/utils/permissions';
import { connectDB } from '~/server/db/mongo';
import { ObjectId } from 'mongodb';
import { addStatus, initializeStatus } from '~/server/features/statuses/service';

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
          queueId: null,
          cassetteInstanceIds: [],
          remnantIds: [],
          createdBy: user.userId,
          createdAt: new Date()
        });
      }
      
      const insertResult = await db.collection('sheets').insertMany(sheetsToCreate, { session });
      
      // Initialize status for each sheet
      for (const id of Object.values(insertResult.insertedIds)) {
        // Since initializeStatus doesn't support session, we might have issues if it fails.
        // But for simplicity of this rework, I'll use it as-is or manually insert if needed.
        // Manual insert for status during transaction:
        await db.collection('statuses').insertOne({
          entityId: id,
          entityType: 'sheet_instance',
          status: 'in_stock',
          userId: user.userId,
          note: `Allocated from batch ${batchId}`,
          timestamp: new Date()
        }, { session });

        await db.collection('sheets').updateOne(
          { _id: id },
          { $set: { status: 'in_stock' } },
          { session }
        );
      }

      createdSheets = sheetsToCreate.map((s, idx) => ({ ...s, _id: insertResult.insertedIds[idx], status: 'in_stock' }));
      
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
  delete updates._id;
  delete updates.createdAt;
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
  
  return await addStatus('sheets', id, newStatus, user.userId, note || '', { operatorType });
}

export async function markForCutting(sheetIds, queueId, user) {
  if (!hasPermission(user, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  const db = await connectDB();
  const now = new Date();
  
  const sheetObjectIds = sheetIds.map(id => new ObjectId(id));

  const result = await db.collection('sheets').updateMany(
    { 
      _id: { $in: sheetObjectIds },
      status: 'in_stock'
    },
    { 
      $set: { 
        status: 'in_cutting',
        queueId: new ObjectId(queueId),
        updatedAt: now
      }
    }
  );

  // Log status for each sheet
  if (result.modifiedCount > 0) {
    const statusEntries = sheetObjectIds.map(id => ({
      entityId: id,
      entityType: 'sheet_instance',
      status: 'in_cutting',
      userId: user.userId,
      note: `Assigned to queue ${queueId}`,
      timestamp: now
    }));
    await db.collection('statuses').insertMany(statusEntries);
  }
  
  return result.modifiedCount;
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
    cassetteInstanceIds: cassetteInstanceIds.map(id => new ObjectId(id)),
    remnantIds: remnantIds.map(id => new ObjectId(id))
  });
  
  await addStatus('sheets', sheetId, 'milled', user.userId, `Created ${cassetteInstanceIds.length} cassettes and ${remnantIds.length} remnants`, {
    operatorType: 'cnc'
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
