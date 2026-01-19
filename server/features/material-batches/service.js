import * as repository from './repository.js';
import * as warehouseService from '../warehouses/service.js';
import * as requisitionRepository from '../requisitions/repository.js';
import { createError } from 'h3';
import { hasPermission } from '~/server/utils/auth-helpers';
import { checkEntityAccess } from '~/server/utils/permissions';
import { connectDB } from '~/server/db/mongo';
import { ObjectId } from 'mongodb';

export async function create(data, user) {
  // Only manufacturers can create material batches
  const org = user.organizationData;
  if (!org || org.type !== 'Manufacturer') {
    throw createError({ statusCode: 403, message: 'Only manufacturers can create material batches' });
  }
  
  if (!hasPermission(user, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  // Validate required fields
  if (!data.supplierId || !data.warehouseId || !data.piles || data.piles.length === 0) {
    throw createError({ statusCode: 400, message: 'SupplierId, warehouseId, and piles required' });
  }
  
  // Verify warehouse access
  const warehouse = await warehouseService.getById(data.warehouseId, user);
  
  // Generate batch number
  const batchNumber = await repository.getNextBatchNumber();
  
  // Process piles
  const piles = data.piles.map(pile => ({
    _id: new ObjectId(),
    partyId: pile.partyId || '',
    totalCount: pile.totalCount || 0,
    usedCount: 0,
    material: pile.material,
    color: pile.color,
    thickness: pile.thickness,
    foilThickness: pile.foilThickness || 0,
    width: pile.width,
    height: pile.height,
    pricePerSqm: pile.pricePerSqm || 0,
    totalPrice: pile.totalPrice || 0
  }));
  
  const batch = await repository.create({
    batchNumber,
    receiptId: data.receiptId || '',
    supplierId: new ObjectId(data.supplierId),
    warehouseId: new ObjectId(data.warehouseId),
    requisitionId: data.requisitionId ? new ObjectId(data.requisitionId) : null,
    piles,
    status: 'requested',
    statusHistory: [{
      status: 'requested',
      timestamp: new Date(),
      userId: user.userId,
      note: 'Material batch created'
    }],
    notes: data.notes || '',
    createdBy: user.userId
  });
  
  // Update warehouse batch count
  await warehouseService.updateInventoryCounts(data.warehouseId, { totalBatches: 1 });
  
  return batch;
}

export async function createFromRequisition(requisitionId, data, user) {
  // Verify requisition exists and is approved
  const requisition = await requisitionRepository.findById(requisitionId);
  if (!requisition) {
    throw createError({ statusCode: 404, message: 'Requisition not found' });
  }
  
  if (requisition.status !== 'approved') {
    throw createError({ statusCode: 409, message: 'Can only create batch from approved requisition' });
  }
  
  // Verify user is the manufacturer
  if (!checkEntityAccess(user, requisition, requisition.manufacturerId)) {
    throw createError({ statusCode: 403, message: 'Cannot create batch for other manufacturer requisition' });
  }
  
  // Convert requisition items to piles
  const piles = requisition.items.map(item => ({
    partyId: data.partyId || '',
    totalCount: item.quantity,
    material: item.material,
    color: item.color,
    thickness: item.thickness,
    foilThickness: item.foilThickness,
    width: item.width,
    height: item.height,
    pricePerSqm: item.pricePerSqm,
    totalPrice: item.totalPrice
  }));
  
  return await create({
    supplierId: data.supplierId,
    warehouseId: data.warehouseId,
    requisitionId,
    receiptId: data.receiptId || '',
    piles,
    notes: data.notes || `Fulfilling requisition ${requisition.requisitionNumber}`
  }, user);
}

export async function list(user, filter = {}) {
  const org = user.organizationData;
  if (!org) {
    throw createError({ statusCode: 403, message: 'User must belong to an organization' });
  }
  
  // Filter by organization type
  if (org.type === 'Manufacturer') {
    filter.supplierId = user.organizationId;
  } else if (org.type === 'Contractor') {
    // Contractors see batches in their warehouses
    const warehouses = await warehouseService.list(user);
    const warehouseIds = warehouses.map(w => w._id);
    filter.warehouseId = { $in: warehouseIds };
  }
  
  return await repository.find(filter);
}

export async function getById(id, user) {
  const batch = await repository.findById(id);
  if (!batch) {
    throw createError({ statusCode: 404, message: 'Material batch not found' });
  }
  
  // Check access
  const org = user.organizationData;
  if (!org) {
    throw createError({ statusCode: 403, message: 'User must belong to an organization' });
  }
  
  // Manufacturer that created it or contractor that owns warehouse
  const hasAccess = 
    (org.type === 'Manufacturer' && batch.supplierId.equals(user.organizationId)) ||
    (org.type === 'Contractor' && checkEntityAccess(user, { warehouseId: batch.warehouseId }, batch.warehouseId));
  
  if (!hasAccess) {
    throw createError({ statusCode: 403, message: 'Cannot view material batch' });
  }
  
  return batch;
}

export async function update(id, updates, user) {
  const batch = await repository.findById(id);
  if (!batch) {
    throw createError({ statusCode: 404, message: 'Material batch not found' });
  }
  
  // Only supplier can update
  if (!checkEntityAccess(user, batch, batch.supplierId)) {
    throw createError({ statusCode: 403, message: 'Cannot update material batch' });
  }
  
  if (!hasPermission(user, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  // Don't allow changing critical fields
  delete updates.batchNumber;
  delete updates.supplierId;
  delete updates.warehouseId;
  delete updates.piles;
  delete updates.status;
  delete updates.statusHistory;
  
  const success = await repository.updateById(id, updates);
  if (!success) {
    throw createError({ statusCode: 500, message: 'Update failed' });
  }
  
  return await repository.findById(id);
}

export async function updateStatus(id, newStatus, note, user, additionalData = {}) {
  const batch = await repository.findById(id);
  if (!batch) {
    throw createError({ statusCode: 404, message: 'Material batch not found' });
  }
  
  // Validate status transition
  const validStatuses = ['requested', 'assembled', 'sent', 'arrived', 'in_stock', 'partially_used', 'used_up'];
  if (!validStatuses.includes(newStatus)) {
    throw createError({ statusCode: 400, message: 'Invalid status' });
  }
  
  // Check permissions based on status
  const org = user.organizationData;
  if (newStatus === 'assembled' || newStatus === 'sent') {
    // Manufacturer updates
    if (!checkEntityAccess(user, batch, batch.supplierId)) {
      throw createError({ statusCode: 403, message: 'Only supplier can update to this status' });
    }
  } else if (newStatus === 'arrived' || newStatus === 'in_stock') {
    // Contractor updates
    const warehouse = await warehouseService.getById(batch.warehouseId.toString(), user);
  }
  
  if (!hasPermission(user, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  await repository.addStatusHistory(id, {
    status: newStatus,
    timestamp: new Date(),
    userId: user.userId,
    note: note || '',
    transportInfo: additionalData.transportInfo || '',
    deliveryDate: additionalData.deliveryDate || null
  });
  
  return await repository.findById(id);
}

export async function allocateSheets(batchId, pileId, count, userId) {
  const db = await connectDB();
  const session = db.client.startSession();
  
  try {
    let sheets = [];
    
    await session.withTransaction(async () => {
      // 1. Get batch and pile details
      const batch = await repository.findById(batchId);
      if (!batch) {
        throw createError({ statusCode: 404, message: 'Material batch not found' });
      }
      
      const pile = batch.piles.find(p => p._id.equals(new ObjectId(pileId)));
      if (!pile) {
        throw createError({ statusCode: 404, message: 'Pile not found' });
      }
      
      // 2. Check available count
      const available = pile.totalCount - pile.usedCount;
      if (available < count) {
        throw createError({ statusCode: 409, message: `Insufficient sheets in pile. Available: ${available}, requested: ${count}` });
      }
      
      // 3. Decrement pile usedCount
      const success = await repository.incrementPileUsedCount(batchId, pileId, count, session);
      if (!success) {
        throw createError({ statusCode: 409, message: 'Failed to allocate sheets from pile' });
      }
      
      // 4. Create sheets (will be done by sheets service)
      sheets = Array.from({ length: count }, (_, i) => ({
        batchId: new ObjectId(batchId),
        pileId: new ObjectId(pileId),
        warehouseId: batch.warehouseId,
        material: pile.material,
        color: pile.color,
        thickness: pile.thickness,
        foilThickness: pile.foilThickness,
        width: pile.width,
        height: pile.height
      }));
      
      // 5. Update batch status if needed
      const newUsedCount = pile.usedCount + count;
      if (newUsedCount >= pile.totalCount) {
        // Check if all piles are used up
        const batchAfter = await db.collection('material_batches').findOne(
          { _id: new ObjectId(batchId) },
          { session }
        );
        const allUsedUp = batchAfter.piles.every(p => p.usedCount >= p.totalCount);
        const newBatchStatus = allUsedUp ? 'used_up' : 'partially_used';
        
        await db.collection('material_batches').updateOne(
          { _id: new ObjectId(batchId) },
          { 
            $set: { status: newBatchStatus, updatedAt: new Date() },
            $push: {
              statusHistory: {
                status: newBatchStatus,
                timestamp: new Date(),
                userId,
                note: `Sheets allocated: ${count}`
              }
            }
          },
          { session }
        );
      }
    });
    
    return { success: true, sheets };
  } finally {
    await session.endSession();
  }
}

export async function remove(id, user) {
  if (!hasPermission(user, 'materials', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  const batch = await repository.findById(id);
  if (!batch) {
    throw createError({ statusCode: 404, message: 'Material batch not found' });
  }
  
  // Only supplier can delete
  if (!checkEntityAccess(user, batch, batch.supplierId)) {
    throw createError({ statusCode: 403, message: 'Cannot delete material batch' });
  }
  
  // Can't delete if any sheets allocated
  const anyUsed = batch.piles.some(p => p.usedCount > 0);
  if (anyUsed) {
    throw createError({ statusCode: 409, message: 'Cannot delete batch with allocated sheets' });
  }
  
  const success = await repository.deleteById(id);
  if (!success) {
    throw createError({ statusCode: 404, message: 'Material batch not found' });
  }
  
  // Update warehouse count
  await warehouseService.updateInventoryCounts(batch.warehouseId.toString(), { totalBatches: -1 });
  
  return { success: true };
}
