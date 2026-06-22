import * as repository from './repository.js';
import * as catalogService from '../catalogs/service.js';
import { createError } from 'h3';
import { hasLineagePermission, getLineageFilter } from '~/server/utils/permissions';
import { inheritLineage } from '~/server/core/blocks/index.js';
import { Color } from './model.js';
import { statusService } from '~/server/core/machines/service';
import { mapLineageQuery } from '~/server/utils/query';
import { ObjectId } from 'mongodb';

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
