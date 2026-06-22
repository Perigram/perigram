import * as repository from './repository.js';
import { createError } from 'h3';
import { hasLineagePermission, getLineageFilter } from '../../utils/permissions.js';
import {
  createIdentity,
  createStatus,
  inheritLineage,
  createData,
  getPrimaryState
} from '../../core/blocks/index.js';
import { createTransitionAuth, statusService } from '../../core/machines/service.js';
import { aggregator } from '../../core/machines/aggregator.js';
import { CassetteInstance } from './model.js';
import { toFlexibleId } from '../../utils/objectid.js';
import { mapLineageQuery } from '../../utils/query.js';
import { ObjectId } from 'mongodb';

/**
 * Cassette Instances Service - v24 Standardized
 */

function serializeInstance(raw) {
  const instance = new CassetteInstance(raw).toJSON();
  if (instance.data?.source === 'QUEUE_CUT' && getPrimaryState(instance.status) === 'NESTED') {
    instance.status = {
      ...instance.status,
      state: {
        schemaVersion: 2,
        primary: 'CUT',
        active: { main: 'CUT' },
        regions: { main: { state: 'CUT', path: ['CUT'] } }
      }
    };
  }
  return instance;
}


export async function createFromSheet(sheet, designs, userId, userRole, userPermissions) {
  // 1. Permission Check
  if (!hasLineagePermission(userPermissions, sheet.lineage, 'projects', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  // 2. Lineage Inheritance
  const baseLineage = inheritLineage(sheet, 'sheet');

  const created = [];
  for (const designEntry of designs) {
    // designEntry: { designId, instanceNumber, reference }
    const origin = createStatus('CUT', userId, { note: 'Instantiated from cut sheet' });

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
    created.push(serializeInstance(raw));
  }

  // Trigger summary update on project
  aggregator.syncParentSummary('cassette_instance', baseLineage).catch(err => {
    console.error('[Instance Service] Failed to sync parent summary:', err.message);
  });

  return created;
}

export async function createFromCutSheet(sheet, designs = [], userId = 'SYSTEM') {
  const baseLineage = sheet.data?.virtualSource
    ? { ...(sheet.lineage || {}) }
    : inheritLineage(sheet, 'sheet');
  const created = [];
  let instanceOffset = 0;

  for (const designEntry of designs) {
    const count = Math.max(Math.floor(Number(designEntry.count || 1)), 0);
    for (let index = 0; index < count; index += 1) {
      instanceOffset += 1;
      const uid = `ci-${new ObjectId().toString().slice(-8)}-${instanceOffset}`;
      const serial = designEntry.serial || `${sheet.identity?.serial || 'CUT'}-${instanceOffset}`;
      const origin = createStatus('CUT', userId, { note: 'Produced from queue cut' });
      const instanceLineage = {
        ...(baseLineage.toJSON?.() || baseLineage),
        designId: toFlexibleId(designEntry.designId || designEntry.cassetteDesignId),
        sheetDesignId: toFlexibleId(designEntry.sheetDesignId)
      };

      const instanceData = {
        identity: createIdentity(`Cassette ${serial}`, uid, serial, designEntry.reference || ''),
        origin,
        status: origin,
        lineage: instanceLineage,
        data: createData({
          source: 'QUEUE_CUT',
          sheetDesignId: designEntry.sheetDesignId,
          cassetteDesignId: designEntry.designId || designEntry.cassetteDesignId
        })
      };

      const raw = await repository.create(instanceData);
      created.push(serializeInstance(raw));
    }
  }

  aggregator.syncParentSummary('cassette_instance', baseLineage).catch(err => {
    console.error('[Instance Service] Failed to sync parent summary:', err.message);
  });

  return created;
}

export async function list(userId, userOrg, userRole, userPermissions, options = {}) {
  const filter = getLineageFilter(userPermissions);
  const queryFilter = mapLineageQuery(options);
  const raws = await repository.find({ ...queryFilter, ...filter });
  return raws.map(serializeInstance);
}

export async function listByQueue(queueId, userId, userOrg, userRole, userPermissions) {
  const filter = {
    ...getLineageFilter(userPermissions),
    'lineage.queueId': toFlexibleId(queueId)
  };
  const raws = await repository.find(filter);
  return raws.map(serializeInstance);
}

export async function getById(id, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(id);
  if (!raw) {
    throw createError({ statusCode: 404, message: 'Cassette instance not found' });
  }

  const instance = new CassetteInstance(raw);

  if (userPermissions && !hasLineagePermission(userPermissions, instance.lineage, 'projects', 'read')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  return serializeInstance(raw);
}

export async function update(id, updates, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(id);
  if (!raw) throw createError({ statusCode: 404, message: 'Cassette instance not found' });
  const instance = new CassetteInstance(raw);

  if (!hasLineagePermission(userPermissions, instance.lineage, 'projects', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  // Status updates must go through statusService
  if (updates.status) {
    await statusService.transition('cassette_instance', instance._id, updates.status, userId, createTransitionAuth(userId, userRole, userPermissions), updates.statusMeta || {});
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
  return serializeInstance(updatedRaw);
}

export async function updateStatus(id, state, note, user) {
  const instance = await getById(id, user.userId, user.organizationId, user.role, user);
  return await statusService.transition('cassette_instance', instance._id || instance.id, state, user.userId, createTransitionAuth(user.userId, user), { note });
}

export async function remove(id, userId, userOrg, userRole, userPermissions) {
  const instance = await getById(id, userId, userOrg, userRole, userPermissions);

  if (!hasLineagePermission(userPermissions, instance.lineage, 'projects', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  return await repository.deleteById(id);
}
