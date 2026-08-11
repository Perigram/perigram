import * as repository from './repository.js';
import { createProcessUpdateHandler } from '../_template/process-update-handler.js';
import * as catalogRepository from '../catalogs/repository.js';
import * as colorRepository from '../colors/repository.js';
import { createError } from 'h3';
import { hasLineagePermission, getLineageFilter } from '~/server/utils/permissions';
import { hasPermissionGrant } from '#shared/access-control.js';
import { ObjectId } from 'mongodb';
import { createIdentity, createData } from '~/server/core/blocks/index.js';
import { createTransitionAuth, statusService } from '~/server/core/machines/service';
import { toFlexibleId } from '~/server/utils/objectid.js';
import { Requisition } from './model.js';

/**
 * Requisitions Service - v24 Standardized
 */


function toDTO(requisition) {
  if (!requisition) return null;
  return {
    _id: requisition._id,
    identity: requisition.identity,
    lineage: requisition.lineage || {},
    origin: requisition.origin || null,
    status: requisition.status || null,
    data: requisition.data || {},
    summary: requisition.summary || {}
  };
}

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
      priceSnapshot: color.data?.pricing?.pricePerSqm || 0
    });
  }
  
  const serial = await repository.getNextRequisitionNumber();
  const lineage = {
    organizationId: toFlexibleId(userOrg),
    manufacturerId: toFlexibleId(data.manufacturerId),
    projectId: data.projectId ? toFlexibleId(data.projectId) : null
  };
  const origin = await statusService.initialStatusForOrganization(
    'requisition',
    lineage.organizationId,
    userId,
    { note: 'Initial requisition' }
  );

  const requisitionData = {
    identity: createIdentity(data.name || `REQ-${serial}`, '', serial),
    origin,
    status: origin,
    lineage,
    data: createData({
      items: snapshotItems,
      notes: data.notes || ''
    })
  };

  // Verify permissions
  if (!hasPermissionGrant({
    permissions: permissionsForOrganization(userPermissions, userOrg),
    feature: 'requisitions',
    action: 'create',
    entity: { lineage: requisitionData.lineage }
  })) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  if (!hasLineagePermission(userPermissions, requisitionData.lineage, 'requisitions', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const requisition = await repository.create(requisitionData);
  return toDTO(requisition);
}

function permissionsForOrganization(auth = {}, organizationId) {
  if (auth.effectivePermissions) return auth.effectivePermissions;
  const membership = (auth.memberships || []).find(item => item.organizationId?.toString() === organizationId?.toString());
  return membership?.permissions || auth.permissions || {};
}

function lineageMatchValues(value) {
  const flexible = toFlexibleId(value);
  const values = [flexible];
  const stringValue = value?.toString?.() || value;
  if (stringValue && !values.some(entry => entry?.toString?.() === stringValue)) {
    values.push(stringValue);
  }
  return values;
}

export async function list(userId, userOrg, userRole, userPermissions) {
  const filter = { ...getLineageFilter(userPermissions) };
  delete filter['lineage.organizationId'];
  // Add specific filter to see either as contractor (organizationId) or manufacturer (manufacturerId)
  const orgIds = lineageMatchValues(userOrg);
  filter.$or = [
    { 'lineage.organizationId': { $in: orgIds } },
    { 'lineage.manufacturerId': { $in: orgIds } }
  ];
  
  const requisitions = await repository.find(filter);
  return requisitions.map(toDTO);
}

export async function getById(id, userId, userOrg, userRole, userPermissions) {
  const requisition = await repository.findById(id);
  if (!requisition) throw createError({ statusCode: 404, message: 'Requisition not found' });
  
  if (!hasLineagePermission(userPermissions, requisition.lineage, 'requisitions', 'read')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  return toDTO(requisition);
}

export async function update(id, updates, userId, userOrg, userRole, userPermissions) {
    const requisition = await repository.findById(id);
    if (!requisition) throw createError({ statusCode: 404, message: 'Requisition not found' });
    
    if (!hasLineagePermission(userPermissions, requisition.lineage, 'requisitions', 'write')) {
        throw createError({ statusCode: 403, message: 'Permission denied' });
    }

    if (updates.status) {
        await statusService.transitionWithResult({
            entityType: 'requisition',
            targetId: requisition._id,
            targetState: updates.status,
            auth: createTransitionAuth(userId, userRole, userPermissions),
            context: updates.statusMeta || {}
        });
        delete updates.status;
    }

    const { identity, origin, status, lineage, data: updatesData, ...clean } = updates;
    
    if (updates.name) requisition.identity.name = updates.name;

    const requisitionData = {
        ...requisition.data,
        ...updatesData,
        ...clean
    };

    await repository.updateById(id, { identity: requisition.identity, data: requisitionData });
    const updated = await repository.findById(id);
    return toDTO(updated);
}

export async function transition(id, targetState, metadata, userId, userOrg, userRole, userPermissions) {
    const requisition = await getById(id, userId, userOrg, userRole, userPermissions);
    const result = await statusService.transitionWithResult({
        entityType: 'requisition',
        targetId: requisition._id,
        targetState,
        auth: createTransitionAuth(userId, userRole, {
            organizationId: userOrg,
            memberships: userPermissions?.memberships || [],
            effectivePermissions: userPermissions?.effectivePermissions || null,
            permissions: userPermissions?.permissions || {}
        }),
        context: metadata
    });
    return result.status;
}

export async function send(id, userId, userOrg, userRole, userPermissions) {
    return await applyRequisitionIntent(id, 'submitRequisition', { note: 'Requisition submitted' }, userId, userOrg, userRole, userPermissions);
}

export async function approve(id, userId, userOrg, userRole, userPermissions) {
    return await applyRequisitionIntent(id, 'approveRequisition', { note: 'Requisition approved' }, userId, userOrg, userRole, userPermissions);
}

export async function reject(id, userId, userOrg, userRole, userPermissions) {
    return await applyRequisitionIntent(id, 'rejectRequisition', { note: 'Requisition rejected' }, userId, userOrg, userRole, userPermissions);
}

export async function fulfill(id, userId, userOrg, userRole, userPermissions) {
    return await applyRequisitionIntent(id, 'fulfillRequisition', { note: 'Requisition fulfilled' }, userId, userOrg, userRole, userPermissions);
}

export async function startFulfillment(id, userId, userOrg, userRole, userPermissions) {
    return await applyRequisitionIntent(id, 'approveRequisition', { note: 'Fulfillment started' }, userId, userOrg, userRole, userPermissions);
}

export async function cancel(id, userId, userOrg, userRole, userPermissions) {
    return await applyRequisitionIntent(id, 'rejectRequisition', { note: 'Requisition canceled' }, userId, userOrg, userRole, userPermissions);
}

async function applyRequisitionIntent(id, intent, metadata, userId, userOrg, userRole, userPermissions) {
    const requisition = await getById(id, userId, userOrg, userRole, userPermissions);
    return await statusService.applyIntent(
        'requisition',
        requisition._id,
        intent,
        createTransitionAuth(userId, userRole, {
            organizationId: userOrg,
            memberships: userPermissions?.memberships || [],
            effectivePermissions: userPermissions?.effectivePermissions || null,
            permissions: userPermissions?.permissions || {}
        }),
        metadata
    );
}

export async function remove(id, userId, userOrg, userRole, userPermissions) {
    const requisition = await getById(id, userId, userOrg, userRole, userPermissions);
    if (!hasLineagePermission(userPermissions, requisition.lineage, 'requisitions', 'admin')) {
        throw createError({ statusCode: 403, message: 'Permission denied' });
    }
    return await repository.deleteById(id);
}

export const processUpdate = createProcessUpdateHandler({
  entityType: 'requisition',
  repository,
  Model: Requisition
});
