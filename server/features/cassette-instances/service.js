import * as repository from './repository.js';
import { createError } from 'h3';
import { hasLineagePermission, getLineageFilter } from '../../utils/permissions.js';
import {
  createIdentity,
  createStatus,
  inheritLineage,
  createData
} from '../../core/blocks/index.js';
import { statusService } from '../../core/machines/service.js';
import { aggregator } from '../../core/machines/aggregator.js';
import { CassetteInstance } from './model.js';
import { toFlexibleId } from '../../utils/objectid.js';
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

  const created = [];
  for (const designEntry of designs) {
    // designEntry: { designId, instanceNumber, reference }
    const origin = createStatus('NESTED', userId, { note: 'Instantiated from cut sheet' });

    // Merge lineages: digital from design + physical from sheet
    const instanceLineage = {
      ...baseLineage,
      designId: toFlexibleId(designEntry.designId)
    };

    const instanceData = {
      identity: createIdentity(`Cassette ${designEntry.instanceNumber}`, '', designEntry.instanceNumber, designEntry.reference || ''),
      origin,
      status: origin,
      lineage: instanceLineage,
      data: createData({
        // Any physical properties can go here
      })
    };

    const raw = await repository.create(instanceData);
    created.push(new CassetteInstance(raw).toJSON());
  }

  // Trigger summary update on project
  aggregator.syncParentSummary('cassette_instance', baseLineage).catch(err => {
    console.error('[Instance Service] Failed to sync parent summary:', err.message);
  });

  return created;
}

export async function list(userId, userOrg, userRole, userPermissions, options = {}) {
  const filter = getLineageFilter({ memberships: userPermissions.memberships, role: userRole });
  const raws = await repository.find(filter);
  return raws.map(raw => new CassetteInstance(raw).toJSON());
}

export async function listByQueue(queueId, userId, userOrg, userRole, userPermissions) {
  const filter = {
    ...getLineageFilter({ memberships: userPermissions.memberships, role: userRole }),
    'lineage.queueId': toFlexibleId(queueId)
  };
  const raws = await repository.find(filter);
  return raws.map(raw => new CassetteInstance(raw).toJSON());
}

export async function getById(id, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(id);
  if (!raw) {
    throw createError({ statusCode: 404, message: 'Cassette instance not found' });
  }

  const instance = new CassetteInstance(raw);

  if (userPermissions && !hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, instance.lineage, 'projects', 'read')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  return instance.toJSON();
}

export async function update(id, updates, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(id);
  if (!raw) throw createError({ statusCode: 404, message: 'Cassette instance not found' });
  const instance = new CassetteInstance(raw);

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
  const updatedRaw = await repository.findById(id);
  return new CassetteInstance(updatedRaw).toJSON();
}

export async function updateStatus(id, state, note, user) {
  const instance = await getById(id, user.userId, user.organizationId, user.role, user);
  return await statusService.transition('cassette_instance', instance._id || instance.id, state, user.userId, user.role, { note });
}

export async function remove(id, userId, userOrg, userRole, userPermissions) {
  const instance = await getById(id, userId, userOrg, userRole, userPermissions);

  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, instance.lineage, 'projects', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  return await repository.deleteById(id);
}
