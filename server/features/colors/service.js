import * as repository from './repository.js';
import * as catalogService from '../catalogs/service.js';
import { createError } from 'h3';
import { hasLineagePermission } from '~/server/utils/permissions';
import { inheritLineage, registerService } from '~/server/utils/blocks';
import { Color } from './model.js';
import { statusService } from '~/server/core/machines/service';
import { mapLineageQuery } from '~/server/utils/query';
import { ObjectId } from 'mongodb';

/**
 * Colors Service - v24 Absolute Final
 */

registerService('color', {
  getById: (uid) => getById(uid)
});

export async function create(data, userId, userOrg, userRole, userPermissions) {
  const { catalogId, name, code, hexCode, textureUrl } = data;
  const catalog = await catalogService.getById(catalogId);
  if (!catalog) throw createError({ statusCode: 404, message: 'Catalog not found' });

  const color = new Color({
    identity: { uid: `col-${new ObjectId().toString().substring(0, 8)}`, name: name || 'New Color' },
    lineage: inheritLineage(catalog, 'catalog'),
    params: { code, visuals: { hexCode, textureUrl } }
  });

  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, color.lineage, 'catalogs', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  color.applyStatus('ACTIVE', userId, { note: 'Color created' });

  const createdRaw = await repository.create(color);
  return new Color(createdRaw);
}

export async function getById(uid) {
  const raw = await repository.findById(uid);
  if (!raw) return null;
  return new Color(raw);
}

export async function list(userId, userOrg, userRole, userPermissions, filter = {}) {
  const finalFilter = mapLineageQuery(filter);
  const raws = await repository.find(finalFilter);
  return raws.map(raw => new Color(raw));
}

export async function update(uid, updates, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(uid);
  if (!raw) throw createError({ statusCode: 404, message: 'Color not found' });
  const color = new Color(raw);
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, color.lineage, 'catalogs', 'write')) {
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
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, color.lineage, 'catalogs', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  return await repository.deleteById(uid);
}
