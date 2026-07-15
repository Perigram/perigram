import * as repository from './repository.js';
import * as materialPilesRepository from '../material-piles/repository.js';
import { createError } from 'h3';
import { hasLineagePermission, getLineageFilter } from '~/server/utils/permissions';
import { inheritLineage } from '~/server/core/blocks/index.js';
import { Sheet } from './model.js';
import { createTransitionAuth, statusService } from '~/server/core/machines/service';
import { generateRandomString } from '~/server/utils/strings';
import { mapLineageQuery } from '~/server/utils/query';
import { toFlexibleId } from '~/server/utils/objectid.js';
import { serializeForAccess } from '~/server/utils/entity-redaction.js';

/**
 * Sheets Service - v24 Absolute Final
 */


export async function createFromPile(pileId, count, userId, userRole, userPermissions) {
  const pileRaw = await materialPilesRepository.findById(pileId);
  if (!pileRaw) throw createError({ statusCode: 404, message: 'Material pile not found' });

  if (!hasLineagePermission(userPermissions, pileRaw.lineage, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const available = (pileRaw.data?.stock?.total || 0) - (pileRaw.data?.stock?.used || 0);
  if (available < count) {
    throw createError({ statusCode: 400, message: `Insufficient stock in pile. Available: ${available}` });
  }

  const baseLineage = inheritLineage(pileRaw, 'pile');
  const created = [];

  for (let i = 0; i < count; i++) {
    const serial = `SH-${generateRandomString(8)}`;
    const sheet = new Sheet({
      identity: { uid: `sheet-${generateRandomString(8)}`, serial, name: `Sheet ${serial}` },
      lineage: baseLineage,
      data: { serial, specs: pileRaw.data.specs || {} }
    });
    
    const initialStatus = await statusService.initialStatusForOrganization(
      'sheet',
      baseLineage.organizationId,
      userId,
      { note: 'Created from material pile' }
    );
    sheet.origin = initialStatus;
    sheet.status = initialStatus;
    const createdRaw = await repository.create(sheet);
    created.push(new Sheet(createdRaw));
  }

  await materialPilesRepository.updateById(pileId, { 
    'data.stock.used': (pileRaw.data?.stock?.used || 0) + count 
  });

  return created;
}

export async function allocateFromPile(pileId, count, user) {
  const userPermissions = { memberships: user.memberships };
  return await createFromPile(pileId, count, user.userId, user.role, userPermissions);
}

export async function createFromSheetDesign(design, count, { organizationId, userId = 'SYSTEM' } = {}) {
  if (!design?._id) throw createError({ statusCode: 400, message: 'Sheet design is required' });
  const quantity = Math.max(Number(count || design.data?.sheetCount || 0), 0);
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw createError({ statusCode: 400, message: 'Sheet design quantity must be a positive integer' });
  }
  const lineage = inheritLineage(design, 'sheetDesign');
  const ownerOrganizationId = organizationId || lineage.organizationId;
  const existing = await repository.find({ 'lineage.sheetDesignId': toFlexibleId(design._id) });
  const byIndex = new Map(existing.map(sheet => [Number(sheet.data?.sheetIndex), sheet]));
  const created = [];
  for (let index = 0; index < quantity; index += 1) {
    if (byIndex.has(index)) {
      created.push(new Sheet(byIndex.get(index)).toJSON());
      continue;
    }
    const uid = `${design._id.toString()}-sheet-${index + 1}`;
    const serial = `${design.identity?.serial || 'SH'}-${index + 1}`;
    const initialStatus = await statusService.initialStatusForOrganization(
      'sheet',
      ownerOrganizationId,
      userId,
      { note: 'Sheet twin created from nesting output' }
    );
    const raw = await repository.create(new Sheet({
      identity: { uid, serial, name: `Sheet ${serial}` },
      origin: initialStatus,
      status: initialStatus,
      lineage,
      specs: design.specs || {},
      provenance: design.data?.revisions?.geometry?.currentId ? {
        parent: {
          source: {
            type: 'sheet_design',
            id: design._id,
            revisionId: design.data.revisions.geometry.currentId
          }
        }
      } : {},
      data: {
        serial,
        sheetIndex: index,
        compositionHash: design.data?.compositionHash || '',
        machineSnapshot: design.data?.machineSnapshot || null,
        toolSnapshot: design.data?.toolSnapshot || null,
        materialSnapshot: design.data?.materialSnapshot || null
      }
    }));
    created.push(new Sheet(raw).toJSON());
  }
  return created;
}

export async function listForRunOutput(queueId, runId, ids = []) {
  const idValues = ids.map(toFlexibleId).filter(Boolean);
  const filter = {
    ...(idValues.length ? { _id: { $in: idValues } } : {}),
    'lineage.queueId': { $in: flexibleLookupValues(queueId) },
    'lineage.runId': { $in: flexibleLookupValues(runId) }
  };
  const sheets = await repository.find(filter);
  return sheets
    .map(raw => new Sheet(raw).toJSON())
    .sort((left, right) => {
      const designOrder = String(left.lineage?.sheetDesignId || '').localeCompare(String(right.lineage?.sheetDesignId || ''));
      return designOrder || Number(left.data?.sheetIndex || 0) - Number(right.data?.sheetIndex || 0);
    });
}

export async function bindMaterialSource(id, source = {}) {
  const raw = await repository.findById(id);
  if (!raw) throw createError({ statusCode: 404, message: 'Sheet twin not found' });
  const sourceId = source.id?.toString?.() || source.id;
  if (!sourceId) throw createError({ statusCode: 400, message: 'Sheet material source is required' });
  const existingSource = raw.data?.materialSource;
  if (existingSource?.id && existingSource.id.toString() !== sourceId.toString()) {
    throw createError({ statusCode: 409, message: 'Sheet twin is already bound to another material source' });
  }
  const lineage = {
    ...(raw.lineage || {}),
    ...(String(source.type || '').toUpperCase() === 'PILE' ? { pileId: toFlexibleId(sourceId) } : {}),
    ...(source.warehouseId ? { warehouseId: toFlexibleId(source.warehouseId) } : {})
  };
  const updated = await repository.updateById(id, {
    lineage,
    data: {
      ...(raw.data || {}),
      materialSource: {
        type: String(source.type || '').toUpperCase(),
        id: sourceId,
        label: source.label || sourceId
      }
    }
  });
  return new Sheet(updated).toJSON();
}

export async function list(userId, userOrg, userRole, userPermissions, filter = {}) {
  const lineageFilter = getLineageFilter(userPermissions);
  const finalFilter = mapLineageQuery({ ...lineageFilter, ...filter });
  const raws = await repository.find(finalFilter);
  return raws.map(raw => new Sheet(raw));
}

export async function listPreviewByQueues(queueIds = [], userId, userOrg, userRole, userPermissions, options = {}) {
  const ids = Array.from(new Set(queueIds.flatMap(id => flexibleLookupValues(id)).filter(Boolean)));
  if (!ids.length) return {};

  const limit = Math.max(Number(options.limit || 4), 1);
  const raws = await repository.find({
    ...getLineageFilter(userPermissions),
    'lineage.queueId': { $in: ids }
  });
  const previews = {};
  const sheets = raws
    .map(raw => new Sheet(raw).toJSON())
    .filter(sheet => hasLineagePermission(userPermissions, sheet, 'materials', 'read'))
    .sort(sortByStatusTimestampDesc);

  for (const sheet of sheets) {
    const queueId = sheet.lineage?.queueId?.toString?.() || sheet.lineage?.queueId;
    if (!queueId) continue;
    previews[queueId] ||= [];
    if (previews[queueId].length >= limit) continue;
    previews[queueId].push(sheetPreview(sheet, userPermissions));
  }

  return previews;
}

export async function getById(uid) {
  const raw = await repository.findById(uid);
  if (!raw) return null;
  return new Sheet(raw);
}

export async function update(uid, updates, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(uid);
  if (!raw) throw createError({ statusCode: 404, message: 'Sheet not found' });
  const sheet = new Sheet(raw);
  
  if (!hasLineagePermission(userPermissions, sheet.lineage, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  if (updates.status) {
    await statusService.transition('sheet', sheet._id, updates.status, userId, createTransitionAuth(userId, userRole, userPermissions), updates.statusMeta || {});
    return await getById(uid);
  }

  const { identity, origin, status, lineage, data: updatesData, ...clean } = updates;
  
  sheet.data = {
    ...sheet.data,
    ...updatesData,
    ...clean
  };

  await repository.updateById(uid, sheet);
  const updatedRaw = await repository.findById(uid);
  return new Sheet(updatedRaw);
}

export async function remove(uid, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(uid);
  if (!raw) throw createError({ statusCode: 404, message: 'Sheet not found' });
  
  if (!hasLineagePermission(userPermissions, raw.lineage, 'materials', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  return await repository.deleteById(uid);
}

export async function finishMilling(uid, cassetteInstanceIds = [], remnantIds = [], user = {}) {
  const raw = await repository.findById(uid);
  if (!raw) throw createError({ statusCode: 404, message: 'Sheet not found' });

  const data = {
    ...(raw.data || {}),
    cassetteInstanceIds,
    remnantIds
  };
  await statusService.transitionWithResult({
    entityType: 'sheet',
    targetId: uid,
    intent: 'completeMilling',
    auth: createTransitionAuth(user.userId || 'SYSTEM', user.role, user),
    context: { metadata: { note: 'Milling completed' } },
    patch: { data }
  });

  const warehouseId = raw.lineage?.warehouseId;
  if (warehouseId) {
    const { updateInventoryCounts } = await import('../warehouses/service.js');
    await updateInventoryCounts(warehouseId, {
      totalSheets: -1,
      totalRemnants: remnantIds.length
    });
  }

  return await getById(uid);
}

function flexibleLookupValues(id) {
  if (id === null || id === undefined) return [];
  const stringId = id?.toString?.() || id;
  const flexibleId = toFlexibleId(id);
  return [flexibleId, stringId].filter((value, index, values) => (
    value !== null && value !== undefined && values.findIndex(item => item?.toString?.() === value?.toString?.()) === index
  ));
}

function sortByStatusTimestampDesc(left = {}, right = {}) {
  return statusTimestamp(right) - statusTimestamp(left);
}

function statusTimestamp(entity = {}) {
  const value = entity.status?.timestamp || entity.origin?.timestamp || entity.updatedAt || entity.createdAt;
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sheetPreview(sheet = {}, userPermissions = null) {
  const preview = {
    _id: sheet._id?.toString?.() || sheet._id,
    entityType: 'sheet',
    identity: {
      ...(sheet.identity || {}),
      name: sheet.identity?.name || sheet.identity?.serial || sheet.identity?.uid || 'Sheet'
    },
    origin: sheet.origin || null,
    status: sheet.status || null,
    lineage: sheet.lineage || {},
    specs: sheet.specs || sheet.data?.specs || {},
    data: {
      serial: sheet.data?.serial || sheet.identity?.serial || ''
    },
    summary: {}
  };
  return serializeForAccess('sheet', preview, userPermissions);
}
