import * as repository from './repository.js';
import * as catalogService from '../catalogs/service.js';
import { createError } from 'h3';
import { hasLineagePermission, getLineageFilter } from '~/server/utils/permissions';
import { inheritLineage } from '~/server/core/blocks/index.js';
import { Color } from './model.js';
import { statusService } from '~/server/core/machines/service';
import { mapLineageQuery } from '~/server/utils/query';
import { ObjectId } from 'mongodb';
import { toFlexibleId } from '~/server/utils/objectid.js';
import { serializeForAccess } from '~/server/utils/entity-redaction.js';

/**
 * Colors Service - v24 Absolute Final
 */


export async function create(data, userId, userOrg, userRole, userPermissions) {
  const { catalogId, name, code, hexCode, textureUrl } = data;
  const catalog = await catalogService.getById(catalogId);
  if (!catalog) throw createError({ statusCode: 404, message: 'Catalog not found' });

  const color = new Color({
    identity: { uid: `col-${new ObjectId().toString().substring(0, 8)}`, name: name || 'New Color' },
    lineage: inheritLineage(catalog, 'catalog'),
    data: {
      code: code || '',
      visuals: { hexCode: hexCode || '#cccccc', textureUrl: textureUrl || null }
    }
  });

  if (!canCreateColor({ color, data, userPermissions })) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  color.applyStatus('ACTIVE', userId, { note: 'Color created' });

  const createdRaw = await repository.create(color);
  return new Color(createdRaw);
}

function canCreateColor({ color, data = {}, userPermissions }) {
  const auth = userPermissions;
  if (hasLineagePermission(auth, color.lineage, 'catalogs', 'write')) return true;
  if (data.source !== 'WAREHOUSE_STOCK') return false;
  return hasLineagePermission(auth, color.lineage, 'materials', 'write');
}

export async function getById(uid) {
  const raw = await repository.findById(uid);
  if (!raw) return null;
  return new Color(raw);
}

export async function list(userId, userOrg, userRole, userPermissions, filter = {}) {
  const finalFilter = mapLineageQuery({
    ...getLineageFilter(userPermissions),
    ...filter
  });
  const raws = await repository.find(finalFilter);
  return raws.map(raw => new Color(raw));
}

export async function listPreviewByCatalogs(catalogIds = [], userId, userOrg, userRole, userPermissions, options = {}) {
  const ids = Array.from(new Set(catalogIds.flatMap(id => flexibleLookupValues(id)).filter(Boolean)));
  if (!ids.length) return {};

  const limit = Math.max(Number(options.limit || 4), 1);
  const raws = await repository.find(mapLineageQuery({
    ...getLineageFilter(userPermissions),
    catalogId: { $in: ids }
  }));
  const previews = {};
  const colors = raws
    .map(raw => new Color(raw).toJSON())
    .filter(color => hasLineagePermission(userPermissions, color, 'catalogs', 'read'))
    .sort(sortByStatusTimestampDesc);

  for (const color of colors) {
    const catalogId = color.lineage?.catalogId?.toString?.() || color.lineage?.catalogId;
    if (!catalogId) continue;
    previews[catalogId] ||= [];
    if (previews[catalogId].length >= limit) continue;
    previews[catalogId].push(colorPreview(color, userPermissions));
  }

  return previews;
}

export async function update(uid, updates, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(uid);
  if (!raw) throw createError({ statusCode: 404, message: 'Color not found' });
  const color = new Color(raw);
  
  if (!hasLineagePermission(userPermissions, color.lineage, 'catalogs', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  if (updates.name) color.identity.name = updates.name;
  color.data = { ...color.data, ...(updates.data || {}) };

  await repository.updateById(uid, color);
  const updatedRaw = await repository.findById(uid);
  return new Color(updatedRaw);
}

export async function remove(uid, userId, userOrg, userRole, userPermissions) {
  const color = await getById(uid);
  if (!color) throw createError({ statusCode: 404, message: 'Color not found' });
  if (!hasLineagePermission(userPermissions, color.lineage, 'catalogs', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  return await repository.deleteById(uid);
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

function colorPreview(color = {}, userPermissions = null) {
  const preview = {
    _id: color._id?.toString?.() || color._id,
    entityType: 'color',
    identity: {
      ...(color.identity || {}),
      name: color.identity?.name || color.data?.code || color.identity?.uid || 'Color'
    },
    origin: color.origin || null,
    status: color.status || null,
    lineage: color.lineage || {},
    data: {
      code: color.data?.code || '',
      visuals: color.data?.visuals || {}
    },
    summary: {}
  };
  return serializeForAccess('color', preview, userPermissions);
}
