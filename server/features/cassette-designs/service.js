import * as repository from './repository.js';
import * as queuesRepository from '../queues/repository.js';
import { createError } from 'h3';
import { hasLineagePermission, getLineageFilter } from '~/server/utils/permissions';
import { createIdentity, createStatus, inheritLineage } from '~/server/utils/blocks';
import { statusService } from '~/server/core/machines/service';
import { mapLineageQuery } from '~/server/utils/query';
import { ObjectId } from 'mongodb';

/**
 * Cassette Designs Service - v24 Standardized
 */

export async function createFromQueue(queueId, data, userId, userRole, userPermissions) {
  const queue = await queuesRepository.findById(queueId);
  if (!queue) throw createError({ statusCode: 404, message: 'Queue not found' });

  // 1. Permission Check
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, queue.lineage, 'projects', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  // 2. Lineage Inheritance
  const lineage = inheritLineage(queue, 'queue');
  if (data.templateId) {
      lineage.templateId = new ObjectId(data.templateId);
  }

  const origin = createStatus('DRAFT', userId, { note: 'Cassette design initialized' });

  const designData = {
    identity: createIdentity(data.name || 'Cassette Design'),
    origin,
    status: origin,
    lineage,
    geometry: {
      data: data.geometryData || null,
      dxfId: data.dxfId ? new ObjectId(data.dxfId) : null
    },
    parameters: data.parameters || {}
  };

  return await repository.create(designData);
}

export async function getById(id, userId, userRole, userPermissions) {
  if (!ObjectId.isValid(id)) throw createError({ statusCode: 400, message: 'Invalid ID' });
  const design = await repository.findById(id);
  if (!design) throw createError({ statusCode: 404, message: 'Cassette design not found' });
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, design.lineage, 'projects', 'read')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  return design;
}

export async function list(userId, userRole, userPermissions, filter = {}) {
  const lineageFilter = getLineageFilter({ memberships: userPermissions.memberships, role: userRole });
  const finalFilter = mapLineageQuery({ ...lineageFilter, ...filter });
  return await repository.find(finalFilter);
}

export async function update(id, updates, userId, userRole, userPermissions) {
  const design = await getById(id, userId, userRole, userPermissions);
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, design.lineage, 'projects', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  if (updates.status) {
    await statusService.transition('cassette_design', design._id, updates.status, userId, userRole, updates.statusMeta || {});
    delete updates.status;
  }

  const { identity, origin, status, lineage, ...clean } = updates;
  
  if (updates.name) design.identity.name = updates.name;

  await repository.updateById(id, { identity: design.identity, ...clean });
  return await repository.findById(id);
}

export async function remove(id, userId, userRole, userPermissions) {
  const design = await getById(id, userId, userRole, userPermissions);
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, design.lineage, 'projects', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  return await repository.deleteById(id);
}