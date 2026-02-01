import * as repository from './repository.js';
import { createError } from 'h3';
import { hasLineagePermission, getLineageFilter } from '~/server/utils/permissions';
import { createIdentity, createStatus, inheritLineage, createData } from '~/server/utils/blocks';
import { statusService } from '~/server/core/machines/service';
import { ObjectId } from 'mongodb';

/**
 * Cassette Instances Service - v24 Standardized
 */

function toDTO(instance) {
  if (!instance) return null;
  return {
    ...instance,
    ...instance.data,
    serial: instance.identity?.serial,
    reference: instance.identity?.reference,
    name: instance.identity?.name
  };
}

export async function createFromSheet(sheet, designs, userId, userRole, userPermissions) {
  // 1. Permission Check
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, sheet.lineage, 'projects', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  // 2. Lineage Inheritance
  const baseLineage = inheritLineage(sheet, 'sheet');

  const instancesToCreate = [];
  
  for (const designEntry of designs) {
    // designEntry: { designId, instanceNumber, reference }
    const origin = createStatus('NESTED', userId, { note: 'Instantiated from cut sheet' });
    
    // Merge lineages: digital from design + physical from sheet
    const instanceLineage = {
      ...baseLineage,
      designId: new ObjectId(designEntry.designId)
    };

    instancesToCreate.push({
      identity: createIdentity(`Cassette ${designEntry.instanceNumber}`, '', designEntry.instanceNumber, designEntry.reference || ''),
      origin,
      status: origin,
      lineage: instanceLineage,
      data: createData({
        // Any physical properties can go here
      })
    });
  }

  const created = [];
  for (const instanceData of instancesToCreate) {
    const instance = await repository.create(instanceData);
    created.push(toDTO(instance));
  }

  return created;
}

export async function list(userId, userOrg, userRole, userPermissions, options = {}) {
  const filter = getLineageFilter({ memberships: userPermissions.memberships, role: userRole });
  const instances = await repository.find(filter);
  return instances.map(toDTO);
}

export async function listByQueue(queueId, userId, userOrg, userRole, userPermissions) {
  const filter = {
    ...getLineageFilter({ memberships: userPermissions.memberships, role: userRole }),
    'lineage.queueId': new ObjectId(queueId)
  };
  const instances = await repository.find(filter);
  return instances.map(toDTO);
}

export async function getById(id, userId, userOrg, userRole, userPermissions) {
  const instance = await repository.findById(id);
  if (!instance) {
    throw createError({ statusCode: 404, message: 'Cassette instance not found' });
  }
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, instance.lineage, 'projects', 'read')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  return toDTO(instance);
}

export async function update(id, updates, userId, userOrg, userRole, userPermissions) {
  const instance = await repository.findById(id);
  if (!instance) throw createError({ statusCode: 404, message: 'Cassette instance not found' });
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, instance.lineage, 'projects', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  // Status updates must go through statusService
  if (updates.status) {
    await statusService.transition('cassette_instance', instance._id, updates.status, userId, userRole, updates.statusMeta || {});
    delete updates.status;
  }

  const { identity, origin, status, lineage, data: updatesData, ...clean } = updates;
  
  // Identity updates
  if (updates.serial) instance.identity.serial = updates.serial;
  if (updates.reference) instance.identity.reference = updates.reference;

  const instanceData = {
    ...instance.data,
    ...updatesData,
    ...clean
  };

  await repository.updateById(id, { identity: instance.identity, data: instanceData });
  const updated = await repository.findById(id);
  return toDTO(updated);
}

export async function updateStatus(id, state, note, user) {
  const instance = await getById(id, user.userId, user.organizationId, user.role, user);
  
  if (!hasLineagePermission({ memberships: user.memberships, role: user.role }, instance.lineage, 'projects', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  return await statusService.transition('cassette-instance', instance._id, state, user.userId, user.role, { note });
}

export async function remove(id, userId, userOrg, userRole, userPermissions) {
  const instance = await getById(id, userId, userOrg, userRole, userPermissions);
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, instance.lineage, 'projects', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  return await repository.deleteById(id);
}