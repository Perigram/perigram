import * as repository from './repository.js';
import * as queuesRepository from '../queues/repository.js';
import { createError } from 'h3';
import { hasLineagePermission, getLineageFilter } from '../../utils/permissions.js';
import {
  createIdentity,
  createStatus,
  inheritLineage,
  createData
} from '../../core/blocks/index.js';
import { statusService } from '../../core/machines/service.js';
import { mapLineageQuery } from '../../utils/query.js';
import { ObjectId } from 'mongodb';
import { toFlexibleId } from '../../utils/objectid.js';
import { CassetteDesign } from './model.js';

/**
 * Cassette Designs Service - v24 Standardized
 */


function toDTO(design) {
  if (!design) return null;
  return new CassetteDesign(design).toJSON();
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
      lineage.templateId = toFlexibleId(data.templateId);
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
        dxfId: data.dxfId ? toFlexibleId(data.dxfId) : null
      },
      parameters: data.parameters || {}
    })
  };

  const created = await repository.create(designData);
  return toDTO(created);
}

export async function getById(id, userId, userRole, userPermissions) {
  const raw = await repository.findById(id);
  if (!raw) throw createError({ statusCode: 404, message: 'Cassette design not found' });

  const design = new CassetteDesign(raw);

  if (userPermissions && !hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, design.lineage, 'projects', 'read')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  return design.toJSON();
}

export async function getByTemplateId(templateId, userId, userOrg, userRole, userPermissions) {
  const filter = { 'lineage.templateId': toFlexibleId(templateId) };
  if (userRole !== 'SuperAdmin') {
    const targetOrgId = userOrg || userId;
    filter['lineage.organizationId'] = toFlexibleId(targetOrgId);
  }

  const designs = await repository.find(filter);
  return toDTO(designs[0]) || null;
}

export async function list(userId, userOrg, userRole, userPermissions, filter = {}) {
  const lineageFilter = getLineageFilter({ memberships: userPermissions.memberships, role: userRole });

  const processedFilter = { ...filter };
  if (processedFilter.queueId) {
    processedFilter['lineage.queueId'] = toFlexibleId(processedFilter.queueId);
    delete processedFilter.queueId;
  }
  if (processedFilter.templateId) {
    processedFilter['lineage.templateId'] = toFlexibleId(processedFilter.templateId);
    delete processedFilter.templateId;
  }

  const finalFilter = { ...lineageFilter, ...processedFilter };
  const designs = await repository.find(finalFilter);
  return designs.map(toDTO);
}

export async function update(id, updates, userId, userRole, userPermissions) {
  const raw = await repository.findById(toFlexibleId(id));
  if (!raw) throw createError({ statusCode: 404, message: 'Cassette design not found' });
  const design = new CassetteDesign(raw);

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
  const updatedRaw = await repository.findById(id);
  return toDTO(updatedRaw);
}

export async function remove(id, userId, userRole, userPermissions) {
  const raw = await repository.findById(toFlexibleId(id));
  if (!raw) throw createError({ statusCode: 404, message: 'Cassette design not found' });
  const design = new CassetteDesign(raw);

  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, design.lineage, 'projects', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  return await repository.deleteById(id);
}
