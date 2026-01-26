import * as repository from './repository.js';
import * as catalogRepository from '../catalogs/repository.js';
import * as colorRepository from '../colors/repository.js';
import { createError } from 'h3';
import { hasLineagePermission, getLineageFilter } from '~/server/utils/permissions';
import { ObjectId } from 'mongodb';
import { createIdentity, createStatus, inheritLineage } from '~/server/utils/blocks';
import { statusService } from '~/server/core/machines/service';

/**
 * Requisitions Service - v24 Standardized
 */

export async function create(data, userId, userOrg, userRole, userPermissions) {
  if (!data.manufacturerId || !data.items || data.items.length === 0) {
    throw createError({ statusCode: 400, message: 'ManufacturerId and items required' });
  }

  // Snapshot prices and specs
  const snapshotItems = [];
  for (const item of data.items) {
    const catalog = await catalogRepository.findById(item.catalogId);
    const color = await colorRepository.findById(item.colorId);
    
    if (!catalog || !color) throw createError({ statusCode: 404, message: 'Catalog or Color not found' });
    
    snapshotItems.push({
      catalogId: new ObjectId(item.catalogId),
      colorId: new ObjectId(item.colorId),
      quantity: item.quantity,
      specs: {
        width: item.width,
        length: item.length,
        sheetThickness: item.sheetThickness,
        foilThickness: item.foilThickness || 0.3
      },
      priceSnapshot: color.pricing?.pricePerSqm || 0
    });
  }
  
  const serial = await repository.getNextRequisitionNumber();
  const origin = createStatus('DRAFT', userId, { note: 'Initial requisition draft' });
  
  const requisitionData = {
    identity: createIdentity(data.name || `REQ-${serial}`, '', serial),
    origin,
    status: origin,
    lineage: {
      organizationId: new ObjectId(userOrg),
      manufacturerId: new ObjectId(data.manufacturerId),
      projectId: data.projectId ? new ObjectId(data.projectId) : null
    },
    items: snapshotItems,
    notes: data.notes || ''
  };

  // Verify permissions
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, requisitionData.lineage, 'requisitions', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  return await repository.create(requisitionData);
}

export async function list(userId, userOrg, userRole, userPermissions) {
  const filter = getLineageFilter({ memberships: userPermissions.memberships, role: userRole });
  // Add specific filter to see either as contractor (organizationId) or manufacturer (manufacturerId)
  const orgId = new ObjectId(userOrg);
  filter.$or = [
    { 'lineage.organizationId': orgId },
    { 'lineage.manufacturerId': orgId }
  ];
  
  return await repository.find(filter);
}

export async function getById(id, userId, userOrg, userRole, userPermissions) {
  const requisition = await repository.findById(id);
  if (!requisition) throw createError({ statusCode: 404, message: 'Requisition not found' });
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, requisition.lineage, 'requisitions', 'read')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  return requisition;
}

export async function update(id, updates, userId, userOrg, userRole, userPermissions) {
    const requisition = await getById(id, userId, userOrg, userRole, userPermissions);
    
    if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, requisition.lineage, 'requisitions', 'write')) {
        throw createError({ statusCode: 403, message: 'Permission denied' });
    }

    // Don't allow changing core identity/lineage
    const { identity, lineage, origin, status, ...clean } = updates;
    
    await repository.updateById(id, clean);
    return await repository.findById(id);
}

export async function transition(id, targetState, metadata, userId, userOrg, userRole, userPermissions) {
    const requisition = await getById(id, userId, userOrg, userRole, userPermissions);
    return await statusService.transition('requisition', requisition._id, targetState, userId, userRole, metadata);
}

export async function send(id, userId, userOrg, userRole, userPermissions) {
    return await transition(id, 'SENT', { note: 'Requisition sent' }, userId, userOrg, userRole, userPermissions);
}

export async function approve(id, userId, userOrg, userRole, userPermissions) {
    return await transition(id, 'APPROVED', { note: 'Requisition approved' }, userId, userOrg, userRole, userPermissions);
}

export async function reject(id, userId, userOrg, userRole, userPermissions) {
    return await transition(id, 'REJECTED', { note: 'Requisition rejected' }, userId, userOrg, userRole, userPermissions);
}

export async function fulfill(id, userId, userOrg, userRole, userPermissions) {
    return await transition(id, 'FULFILLED', { note: 'Requisition fulfilled' }, userId, userOrg, userRole, userPermissions);
}

export async function startFulfillment(id, userId, userOrg, userRole, userPermissions) {
    // Note: v24 might not have separate state for start fulfillment, using APPROVED or similar
    return await transition(id, 'APPROVED', { note: 'Fulfillment started' }, userId, userOrg, userRole, userPermissions);
}

export async function cancel(id, userId, userOrg, userRole, userPermissions) {
    return await transition(id, 'REJECTED', { note: 'Requisition canceled' }, userId, userOrg, userRole, userPermissions);
}

export async function remove(id, userId, userOrg, userRole, userPermissions) {
    const requisition = await getById(id, userId, userOrg, userRole, userPermissions);
    if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, requisition.lineage, 'requisitions', 'admin')) {
        throw createError({ statusCode: 403, message: 'Permission denied' });
    }
    return await repository.deleteById(id);
}