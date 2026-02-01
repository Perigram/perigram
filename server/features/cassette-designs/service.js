import * as repository from './repository.js';
import * as queuesRepository from '../queues/repository.js';
import { createError } from 'h3';
import { hasLineagePermission, getLineageFilter } from '~/server/utils/permissions';
import { createIdentity, createStatus, inheritLineage, createData } from '~/server/utils/blocks';
import { statusService } from '~/server/core/machines/service';
import { mapLineageQuery } from '~/server/utils/query';
import { ObjectId } from 'mongodb';

/**
 * Cassette Designs Service - v24 Standardized
 */

function toDTO(design) {
  if (!design) return null;
  return {
    ...design,
    ...design.data,
    name: design.identity?.name
  };
}

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
    data: createData({
      geometry: {
        data: data.geometryData || null,
        dxfId: data.dxfId ? new ObjectId(data.dxfId) : null
      },
      parameters: data.parameters || {}
    })
  };

  const created = await repository.create(designData);
  return toDTO(created);
}

export async function getById(id, userId, userRole, userPermissions) {
  if (!ObjectId.isValid(id)) throw createError({ statusCode: 400, message: 'Invalid ID' });
  const design = await repository.findById(id);
  if (!design) throw createError({ statusCode: 404, message: 'Cassette design not found' });
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, design.lineage, 'projects', 'read')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  return toDTO(design);
}

export async function getByTemplateId(templateId, userId, userOrg, userRole, userPermissions) {
  if (!ObjectId.isValid(templateId)) throw createError({ statusCode: 400, message: 'Invalid ID' });
  
  const filter = { 'lineage.templateId': new ObjectId(templateId) };
  if (userRole !== 'SuperAdmin') {
    const targetOrgId = userOrg || userId;
    filter['lineage.organizationId'] = new ObjectId(targetOrgId);
  }

  const designs = await repository.find(filter);
  return toDTO(designs[0]) || null;
}

export async function list(userId, userOrg, userRole, userPermissions, filter = {}) {
  const finalFilter = mapLineageQuery(filter);
  
  if (userRole !== 'SuperAdmin') {
    const targetOrgId = userOrg || userId;
    finalFilter['lineage.organizationId'] = new ObjectId(targetOrgId);
  }

  const designs = await repository.find(finalFilter);
  return designs.map(toDTO);
}

export async function update(id, updates, userId, userRole, userPermissions) {
  const design = await repository.findById(id);
  if (!design) throw createError({ statusCode: 404, message: 'Cassette design not found' });
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, design.lineage, 'projects', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  if (updates.status) {
    await statusService.transition('cassette_design', design._id, updates.status, userId, userRole, updates.statusMeta || {});
    delete updates.status;
  }

  const { identity, origin, status, lineage, data: updatesData, ...clean } = updates;
  
  if (updates.name) design.identity.name = updates.name;

  const designData = {
    ...design.data,
    ...updatesData,
    ...clean
  };

  await repository.updateById(id, { identity: design.identity, data: designData });
  const updated = await repository.findById(id);
  return toDTO(updated);
}

export async function remove(id, userId, userRole, userPermissions) {
  const design = await getById(id, userId, userRole, userPermissions);
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, design.lineage, 'projects', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  return await repository.deleteById(id);
}