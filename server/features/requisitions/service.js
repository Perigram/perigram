import * as repository from './repository.js';
import * as catalogRepository from '../catalogs/repository.js';
import * as materialBatchService from '../material-batches/service.js';
import { createError } from 'h3';
import { hasPermission } from '~/server/utils/auth-helpers';
import { checkEntityAccess } from '~/server/utils/permissions';
import { ObjectId } from 'mongodb';

export async function create(data, user) {
  // Only contractors can create requisitions
  const org = user.organizationData;
  if (!org || org.type !== 'Contractor') {
    throw createError({ statusCode: 403, message: 'Only contractors can create requisitions' });
  }
  
  if (!hasPermission(user, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  // Validate required fields
  if (!data.manufacturerId || !data.items || data.items.length === 0) {
    throw createError({ statusCode: 400, message: 'ManufacturerId and items required' });
  }
  
  // Snapshot prices from catalog
  const snapshotItems = [];
  let totalAmount = 0;
  
  for (const item of data.items) {
    if (!item.catalogId || !item.sheetTypeId || !item.sizeIndex || !item.quantity) {
      throw createError({ statusCode: 400, message: 'Invalid item: missing required fields' });
    }
    
    // Get catalog and sheet type
    const catalog = await catalogRepository.findById(item.catalogId);
    if (!catalog) {
      throw createError({ statusCode: 404, message: `Catalog ${item.catalogId} not found` });
    }
    
    const sheetType = catalog.sheetTypes.find(st => st._id.toString() === item.sheetTypeId);
    if (!sheetType) {
      throw createError({ statusCode: 404, message: `Sheet type ${item.sheetTypeId} not found in catalog` });
    }
    
    if (item.sizeIndex >= sheetType.sizes.length) {
      throw createError({ statusCode: 400, message: `Invalid size index ${item.sizeIndex}` });
    }
    
    const size = sheetType.sizes[item.sizeIndex];
    const sheetArea = (size.width * size.height) / 1000000; // Convert mm² to m²
    const itemTotal = sheetArea * size.pricePerSqm * item.quantity;
    totalAmount += itemTotal;
    
    // Snapshot item with price
    snapshotItems.push({
      catalogId: new ObjectId(item.catalogId),
      sheetTypeId: new ObjectId(item.sheetTypeId),
      sizeIndex: item.sizeIndex,
      quantity: item.quantity,
      material: sheetType.material,
      color: sheetType.color,
      thickness: sheetType.thickness,
      foilThickness: sheetType.foilThickness || 0,
      width: size.width,
      height: size.height,
      pricePerSqm: size.pricePerSqm,
      totalPrice: itemTotal
    });
  }
  
  // Generate requisition number
  const requisitionNumber = await repository.getNextRequisitionNumber();
  
  // Create requisition
  return await repository.create({
    requisitionNumber,
    contractorId: user.organizationId,
    manufacturerId: new ObjectId(data.manufacturerId),
    projectId: data.projectId ? new ObjectId(data.projectId) : null,
    queueId: data.queueId ? new ObjectId(data.queueId) : null,
    items: snapshotItems,
    totalAmount,
    status: 'draft',
    statusHistory: [{
      status: 'draft',
      timestamp: new Date(),
      userId: user.userId,
      note: 'Requisition created'
    }],
    notes: data.notes || '',
    createdBy: user.userId
  });
}

export async function list(user, filter = {}) {
  const org = user.organizationData;
  if (!org) {
    throw createError({ statusCode: 403, message: 'User must belong to an organization' });
  }
  
  // Filter by organization type
  if (org.type === 'Contractor') {
    filter.contractorId = user.organizationId;
  } else if (org.type === 'Manufacturer') {
    filter.manufacturerId = user.organizationId;
  } else {
    throw createError({ statusCode: 403, message: 'Invalid organization type for requisitions' });
  }
  
  return await repository.find(filter);
}

export async function getById(id, user) {
  const requisition = await repository.findById(id);
  if (!requisition) {
    throw createError({ statusCode: 404, message: 'Requisition not found' });
  }
  
  // Check access: contractor or manufacturer involved
  const org = user.organizationData;
  if (!org) {
    throw createError({ statusCode: 403, message: 'User must belong to an organization' });
  }
  
  const hasAccess = 
    (org.type === 'Contractor' && requisition.contractorId.equals(user.organizationId)) ||
    (org.type === 'Manufacturer' && requisition.manufacturerId.equals(user.organizationId));
  
  if (!hasAccess) {
    throw createError({ statusCode: 403, message: 'Cannot view requisition' });
  }
  
  return requisition;
}

export async function update(id, updates, user) {
  const requisition = await repository.findById(id);
  if (!requisition) {
    throw createError({ statusCode: 404, message: 'Requisition not found' });
  }
  
  // Only contractor that created can update
  if (!checkEntityAccess(user, requisition, requisition.contractorId)) {
    throw createError({ statusCode: 403, message: 'Cannot update requisition' });
  }
  
  if (!hasPermission(user, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  // Only allow updates in draft status
  if (requisition.status !== 'draft') {
    throw createError({ statusCode: 409, message: 'Can only update draft requisitions' });
  }
  
  // Don't allow changing critical fields
  delete updates.requisitionNumber;
  delete updates.contractorId;
  delete updates.manufacturerId;
  delete updates.items;
  delete updates.totalAmount;
  delete updates.status;
  delete updates.statusHistory;
  
  const success = await repository.updateById(id, updates);
  if (!success) {
    throw createError({ statusCode: 500, message: 'Update failed' });
  }
  
  return await repository.findById(id);
}

export async function send(id, user) {
  const requisition = await repository.findById(id);
  if (!requisition) {
    throw createError({ statusCode: 404, message: 'Requisition not found' });
  }
  
  // Only contractor can send
  if (!checkEntityAccess(user, requisition, requisition.contractorId)) {
    throw createError({ statusCode: 403, message: 'Cannot send requisition' });
  }
  
  if (!hasPermission(user, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  // Can only send from draft
  if (requisition.status !== 'draft') {
    throw createError({ statusCode: 409, message: 'Can only send draft requisitions' });
  }
  
  await repository.addStatusHistory(id, {
    status: 'sent',
    timestamp: new Date(),
    userId: user.userId,
    note: 'Requisition sent to manufacturer'
  });
  
  return await repository.findById(id);
}

export async function approve(id, user) {
  const requisition = await repository.findById(id);
  if (!requisition) {
    throw createError({ statusCode: 404, message: 'Requisition not found' });
  }
  
  // Only manufacturer can approve
  if (!checkEntityAccess(user, requisition, requisition.manufacturerId)) {
    throw createError({ statusCode: 403, message: 'Cannot approve requisition' });
  }
  
  if (!hasPermission(user, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  // Can only approve from sent
  if (requisition.status !== 'sent') {
    throw createError({ statusCode: 409, message: 'Can only approve sent requisitions' });
  }
  
  await repository.addStatusHistory(id, {
    status: 'approved',
    timestamp: new Date(),
    userId: user.userId,
    note: 'Requisition approved by manufacturer'
  });
  
  return await repository.findById(id);
}

export async function reject(id, user) {
  const requisition = await repository.findById(id);
  if (!requisition) {
    throw createError({ statusCode: 404, message: 'Requisition not found' });
  }
  
  // Only manufacturer can reject
  if (!checkEntityAccess(user, requisition, requisition.manufacturerId)) {
    throw createError({ statusCode: 403, message: 'Cannot reject requisition' });
  }
  
  if (!hasPermission(user, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  // Can only reject from sent
  if (requisition.status !== 'sent') {
    throw createError({ statusCode: 409, message: 'Can only reject sent requisitions' });
  }
  
  await repository.addStatusHistory(id, {
    status: 'rejected',
    timestamp: new Date(),
    userId: user.userId,
    note: 'Requisition rejected by manufacturer'
  });
  
  return await repository.findById(id);
}

export async function fulfill(id, data, user) {
  const requisition = await repository.findById(id);
  if (!requisition) {
    throw createError({ statusCode: 404, message: 'Requisition not found' });
  }
  
  // Only manufacturer can fulfill
  if (!checkEntityAccess(user, requisition, requisition.manufacturerId)) {
    throw createError({ statusCode: 403, message: 'Cannot fulfill requisition' });
  }
  
  if (!hasPermission(user, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  // Can only fulfill from approved or in_fulfillment
  if (!['approved', 'in_fulfillment'].includes(requisition.status)) {
    throw createError({ statusCode: 409, message: 'Can only fulfill approved or in-fulfillment requisitions' });
  }

  // Create material batch if warehouseId provided
  if (data?.warehouseId) {
      await materialBatchService.createFromRequisition(id, {
          warehouseId: data.warehouseId,
          supplierId: user.organizationId,
          notes: data.notes
      }, user);
  }
  
  await repository.addStatusHistory(id, {
    status: 'fulfilled',
    timestamp: new Date(),
    userId: user.userId,
    note: 'Requisition fulfilled'
  });
  
  return await repository.findById(id);
}

export async function startFulfillment(id, user) {
  const requisition = await repository.findById(id);
  if (!requisition) {
    throw createError({ statusCode: 404, message: 'Requisition not found' });
  }
  
  // Only manufacturer can start fulfillment
  if (!checkEntityAccess(user, requisition, requisition.manufacturerId)) {
    throw createError({ statusCode: 403, message: 'Cannot update requisition status' });
  }
  
  if (!hasPermission(user, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  // Can only start fulfillment from approved
  if (requisition.status !== 'approved') {
    throw createError({ statusCode: 409, message: 'Can only start fulfillment for approved requisitions' });
  }
  
  await repository.addStatusHistory(id, {
    status: 'in_fulfillment',
    timestamp: new Date(),
    userId: user.userId,
    note: 'Fulfillment started'
  });
  
  return await repository.findById(id);
}

export async function cancel(id, user) {
  const requisition = await repository.findById(id);
  if (!requisition) {
    throw createError({ statusCode: 404, message: 'Requisition not found' });
  }
  
  // Contractor or manufacturer can cancel
  const org = user.organizationData;
  const hasAccess = 
    (org.type === 'Contractor' && requisition.contractorId.equals(user.organizationId)) ||
    (org.type === 'Manufacturer' && requisition.manufacturerId.equals(user.organizationId));
  
  if (!hasAccess) {
    throw createError({ statusCode: 403, message: 'Cannot cancel requisition' });
  }
  
  if (!hasPermission(user, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  // Can't cancel fulfilled
  if (requisition.status === 'fulfilled') {
    throw createError({ statusCode: 409, message: 'Cannot cancel fulfilled requisitions' });
  }
  
  await repository.addStatusHistory(id, {
    status: 'canceled',
    timestamp: new Date(),
    userId: user.userId,
    note: 'Requisition canceled'
  });
  
  return await repository.findById(id);
}

export async function remove(id, user) {
  const requisition = await repository.findById(id);
  if (!requisition) {
    throw createError({ statusCode: 404, message: 'Requisition not found' });
  }
  
  // Only contractor can delete, only in draft
  if (!checkEntityAccess(user, requisition, requisition.contractorId)) {
    throw createError({ statusCode: 403, message: 'Cannot delete requisition' });
  }
  
  if (!hasPermission(user, 'materials', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  if (requisition.status !== 'draft') {
    throw createError({ statusCode: 409, message: 'Can only delete draft requisitions' });
  }
  
  const success = await repository.deleteById(id);
  if (!success) {
    throw createError({ statusCode: 404, message: 'Requisition not found' });
  }
  
  return { success: true };
}
