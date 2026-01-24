import * as repository from './repository.js';
import { createError } from 'h3';
import { hasLineagePermission, getLineageFilter } from '~/server/utils/permissions';
import { createStatus, inheritLineage } from '~/server/utils/blocks';
import { statusService } from '~/server/core/machines/service';
import { ObjectId } from 'mongodb';

/**
 * Cassette Instances Service - v24 Standardized
 */

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
    // Actually, v24 says flat lineage. 
    // We should probably include all relevant IDs.
    const instanceLineage = {
      ...baseLineage,
      designId: new ObjectId(designEntry.designId)
    };

    instancesToCreate.push({
      identity: { 
        serial: designEntry.instanceNumber, 
        reference: designEntry.reference || '' 
      },
      origin,
      status: origin,
      lineage: instanceLineage
    });
  }

  const created = [];
  for (const instanceData of instancesToCreate) {
    const instance = await repository.create(instanceData);
    created.push(instance);
  }

  return created;
}

export async function list(userId, userOrg, userRole, userPermissions, options = {}) {
  const filter = getLineageFilter({ memberships: userPermissions.memberships, role: userRole });
  return await repository.find(filter);
}

export async function getById(id, userId, userOrg, userRole, userPermissions) {
  const instance = await repository.findById(id);
  if (!instance) {
    throw createError({ statusCode: 404, message: 'Cassette instance not found' });
  }
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, instance.lineage, 'projects', 'read')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  return instance;
}

export async function update(id, updates, userId, userOrg, userRole, userPermissions) {
  const instance = await getById(id, userId, userOrg, userRole, userPermissions);
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, instance.lineage, 'projects', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  // Status updates must go through statusService
  if (updates.status) {
    await statusService.transition('cassette_instance', instance._id, updates.status, userId, userRole, updates.statusMeta || {});
    delete updates.status;
  }

  const { identity, origin, status, lineage, ...clean } = updates;
  
  // Identity updates
  if (updates.serial) instance.identity.serial = updates.serial;
  if (updates.reference) instance.identity.reference = updates.reference;

  await repository.updateById(id, { identity: instance.identity, ...clean });
  return await repository.findById(id);
}

export async function remove(id, userId, userOrg, userRole, userPermissions) {
  const instance = await getById(id, userId, userOrg, userRole, userPermissions);
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, instance.lineage, 'projects', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  return await repository.deleteById(id);
}