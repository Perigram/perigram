import * as repository from './repository.js';
import * as catalogRepository from '../catalogs/repository.js';
import * as colorRepository from '../colors/repository.js';
import * as materialPileService from '../material-piles/service.js';
import { createError } from 'h3';
import { hasPermission } from '~/server/utils/auth-helpers';
import { checkEntityAccess } from '~/server/utils/permissions';
import { ObjectId } from 'mongodb';
import { toObjectId } from '~/server/utils/objectid';
import { addStatus, initializeStatus } from '~/server/features/statuses/service';

export async function create(data, user) {
  // Only contractors can create requisitions
  const org = user.organizationData;
  if (!org || org.type !== 'Contractor') {
    throw createError({ statusCode: 403, message: 'Only contractors can create requisitions' });
  }
  
  if (!hasPermission(user, 'requisitions', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  // Validate required fields
  if (!data.manufacturerId || !data.items || data.items.length === 0) {
    throw createError({ statusCode: 400, message: 'ManufacturerId and items required' });
  }

  // Snapshot prices and specs from catalog + color
  const snapshotItems = [];
  let totalAmount = 0;
  
  for (const item of data.items) {
    if (!item.catalogId) throw createError({ statusCode: 400, message: 'item.catalogId required' });
    if (!item.colorId) throw createError({ statusCode: 400, message: 'item.colorId required' });
    if (!item.quantity) throw createError({ statusCode: 400, message: 'item.quantity required' });
    if (!item.sheetThickness) throw createError({ statusCode: 400, message: 'item.sheetThickness required' });
    if (!item.width) throw createError({ statusCode: 400, message: 'item.width required' });
    if (!item.length) throw createError({ statusCode: 400, message: 'item.length required' });
    
    const catalog = await catalogRepository.findById(item.catalogId);
    if (!catalog) throw createError({ statusCode: 404, message: `Catalog ${item.catalogId} not found` });
    
    const color = await colorRepository.findById(item.colorId);
    if (!color) throw createError({ statusCode: 404, message: `Color ${item.colorId} not found` });
    
    // Validate constraints
    if (!catalog.sheetThicknessOptions?.includes(item.sheetThickness)) {
        throw createError({ statusCode: 400, message: `Invalid thickness ${item.sheetThickness}` });
    }

    const pricePerSqm = color.pricePerSqm || 35; // Default price
    const sheetArea = (item.width * item.length) / 1000000; 
    const itemTotal = sheetArea * pricePerSqm * item.quantity;
    totalAmount += itemTotal;
    
    snapshotItems.push({
      catalogId: toObjectId(item.catalogId),
      colorId: toObjectId(item.colorId),
      quantity: item.quantity,
      material: catalog.material,
      color: color.color,
      colorCode: color.colorCode,
      colorFallback: color.colorFallback,
      sheetThickness: item.sheetThickness,
      foilThickness: item.foilThickness || 0.3,
      width: item.width,
      length: item.length,
      pricePerSqm: pricePerSqm,
      totalPrice: itemTotal
    });
  }
  
  // Generate requisition number
  const requisitionNumber = await repository.getNextRequisitionNumber();
  
  // Create requisition
  const requisition = await repository.create({
    requisitionNumber,
    contractorId: toObjectId(user.organizationId),
    manufacturerId: toObjectId(data.manufacturerId),
    projectId: data.projectId ? toObjectId(data.projectId) : null,
    queueId: data.queueId ? toObjectId(data.queueId) : null,
    items: snapshotItems,
    totalAmount,
    notes: data.notes || '',
    createdBy: user.userId
  });

  await initializeStatus('requisitions', requisition._id.toString(), user.userId, 'Requisition created');

  return requisition;
}

export async function list(user, filter = {}) {
  const org = user.organizationData;
  if (!org) {
    throw createError({ statusCode: 403, message: 'User must belong to an organization' });
  }
  
  // Filter by organization type
  if (org.type === 'Contractor') {
    const contractorId = user.organizationId?.toString();
    filter.contractorId = { $in: [contractorId, toObjectId(contractorId)] };
  } else if (org.type === 'Manufacturer') {
    const manufacturerId = user.organizationId?.toString();
    filter.manufacturerId = { $in: [manufacturerId, toObjectId(manufacturerId)] };
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
  
  const userOrgId = user.organizationId?.toString();
  const hasAccess = 
    (org.type === 'Contractor' && requisition.contractorId?.toString() === userOrgId) ||
    (org.type === 'Manufacturer' && requisition.manufacturerId?.toString() === userOrgId);
  
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
  if (requisition.contractorId?.toString() !== user.organizationId?.toString()) {
    throw createError({ statusCode: 403, message: 'Cannot update requisition' });
  }
  
  if (!hasPermission(user, 'requisitions', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  // Only allow updates in draft status
  if (requisition.status !== 'draft') {
    throw createError({ statusCode: 409, message: 'Can only update draft requisitions' });
  }
  
  // Don't allow changing critical fields
  delete updates._id;
  delete updates.createdAt;
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
  if (requisition.contractorId?.toString() !== user.organizationId?.toString()) {
    throw createError({ statusCode: 403, message: 'Cannot send requisition' });
  }
  
  if (!hasPermission(user, 'requisitions', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  // Can only send from draft
  if (requisition.status !== 'draft') {
    throw createError({ statusCode: 409, message: 'Can only send draft requisitions' });
  }
  
  return await addStatus('requisitions', id, 'sent', user.userId, 'Requisition sent to manufacturer');
}

export async function approve(id, user) {
  const requisition = await repository.findById(id);
  if (!requisition) {
    throw createError({ statusCode: 404, message: 'Requisition not found' });
  }
  
  // Only manufacturer can approve
  if (requisition.manufacturerId?.toString() !== user.organizationId?.toString()) {
    throw createError({ statusCode: 403, message: 'Cannot approve requisition' });
  }
  
  if (!hasPermission(user, 'requisitions', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  // Can only approve from sent
  if (requisition.status !== 'sent') {
    throw createError({ statusCode: 409, message: 'Can only approve sent requisitions' });
  }
  
  return await addStatus('requisitions', id, 'approved', user.userId, 'Requisition approved by manufacturer');
}

export async function reject(id, user) {
  const requisition = await repository.findById(id);
  if (!requisition) {
    throw createError({ statusCode: 404, message: 'Requisition not found' });
  }
  
  // Only manufacturer can reject
  if (requisition.manufacturerId?.toString() !== user.organizationId?.toString()) {
    throw createError({ statusCode: 403, message: 'Cannot reject requisition' });
  }
  
  if (!hasPermission(user, 'requisitions', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  // Can only reject from sent
  if (requisition.status !== 'sent') {
    throw createError({ statusCode: 409, message: 'Can only reject sent requisitions' });
  }
  
  return await addStatus('requisitions', id, 'rejected', user.userId, 'Requisition rejected by manufacturer');
}

export async function fulfill(id, data, user) {
  const requisition = await repository.findById(id);
  if (!requisition) {
    throw createError({ statusCode: 404, message: 'Requisition not found' });
  }
  
  // Only manufacturer can fulfill
  if (requisition.manufacturerId?.toString() !== user.organizationId?.toString()) {
    throw createError({ statusCode: 403, message: 'Cannot fulfill requisition' });
  }
  
  if (!hasPermission(user, 'requisitions', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  // Can only fulfill from approved or in_fulfillment
  if (!['approved', 'in_fulfillment'].includes(requisition.status)) {
    throw createError({ statusCode: 409, message: 'Can only fulfill approved or in-fulfillment requisitions' });
  }

  // Create material pile if warehouseId provided
  if (data?.warehouseId) {
      await materialPileService.createFromRequisition(id, {
          warehouseId: data.warehouseId,
          notes: data.notes
      }, user.userId, user.role, { memberships: user.memberships });
  }
  
  return await addStatus('requisitions', id, 'fulfilled', user.userId, 'Requisition fulfilled');
}

export async function startFulfillment(id, user) {
  const requisition = await repository.findById(id);
  if (!requisition) {
    throw createError({ statusCode: 404, message: 'Requisition not found' });
  }
  
  // Only manufacturer can start fulfillment
  if (requisition.manufacturerId?.toString() !== user.organizationId?.toString()) {
    throw createError({ statusCode: 403, message: 'Cannot update requisition status' });
  }
  
  if (!hasPermission(user, 'requisitions', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  // Can only start fulfillment from approved
  if (requisition.status !== 'approved') {
    throw createError({ statusCode: 409, message: 'Can only start fulfillment for approved requisitions' });
  }
  
  return await addStatus('requisitions', id, 'in_fulfillment', user.userId, 'Fulfillment started');
}

export async function cancel(id, user) {
  const requisition = await repository.findById(id);
  if (!requisition) {
    throw createError({ statusCode: 404, message: 'Requisition not found' });
  }
  
  // Contractor or manufacturer can cancel
  const org = user.organizationData;
  const userOrgId = user.organizationId?.toString();
  const hasAccess = 
    (org.type === 'Contractor' && requisition.contractorId?.toString() === userOrgId) ||
    (org.type === 'Manufacturer' && requisition.manufacturerId?.toString() === userOrgId);
  
  if (!hasAccess) {
    throw createError({ statusCode: 403, message: 'Cannot cancel requisition' });
  }
  
  if (!hasPermission(user, 'requisitions', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  // Can't cancel fulfilled
  if (requisition.status === 'fulfilled') {
    throw createError({ statusCode: 409, message: 'Cannot cancel fulfilled requisitions' });
  }
  
  return await addStatus('requisitions', id, 'canceled', user.userId, 'Requisition canceled');
}

export async function remove(id, user) {
  const requisition = await repository.findById(id);
  if (!requisition) {
    throw createError({ statusCode: 404, message: 'Requisition not found' });
  }
  
  // Only contractor can delete, only in draft
  if (requisition.contractorId?.toString() !== user.organizationId?.toString()) {
    throw createError({ statusCode: 403, message: 'Cannot delete requisition' });
  }
  
  if (!hasPermission(user, 'requisitions', 'admin')) {
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
