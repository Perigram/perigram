import * as repository from './repository.js';
import { createError } from 'h3';
import { hasLineagePermission, getLineageFilter } from '~/server/utils/permissions';
import { Catalog } from './model.js';
import { statusService } from '~/server/core/machines/service';
import { mapLineageQuery } from '~/server/utils/query';
import { ObjectId } from 'mongodb';

/**
 * Catalogs Service - v24 Absolute Final
 */


export async function create(data, userId, userOrg, userRole, userPermissions) {
  const { name, material, pricing, options, manufacturerId } = data;
  const targetOrgId = userRole === 'SuperAdmin' ? (manufacturerId || userOrg) : userOrg;
  
  if (!targetOrgId) throw createError({ statusCode: 400, message: 'Manufacturer organization required' });

  const catalog = new Catalog({
    identity: { uid: `cat-${new ObjectId().toString().substring(0, 8)}`, name: name || 'New Catalog' },
    lineage: { organizationId: targetOrgId },
    data: {
      material: material || 'ALUMINUM',
      pricing: pricing || { pricePerSqm: 0, currency: 'USD' },
      options: options || { sheetThicknesses: [], foilThicknesses: [], widths: [], lengths: [] }
    }
  });

  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, catalog.lineage, 'catalogs', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  catalog.applyStatus('ACTIVE', userId, { note: 'Catalog created' });

  const createdRaw = await repository.create(catalog);
  return new Catalog(createdRaw);
}

export async function getById(uid) {
  const raw = await repository.findById(uid);
  if (!raw) return null;
  return new Catalog(raw);
}

export async function list(userId, userOrg, userRole, userPermissions, filter = {}) {
  const lineageFilter = getLineageFilter({ memberships: userPermissions.memberships, role: userRole });
  const isManufacturer = userRole.includes('Manufacturer');
  const finalFilter = isManufacturer ? mapLineageQuery({ ...lineageFilter, ...filter }) : mapLineageQuery(filter);
  
  const raws = await repository.find(finalFilter);
  return raws.map(raw => new Catalog(raw));
}

export async function update(uid, updates, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(uid);
  if (!raw) throw createError({ statusCode: 404, message: 'Catalog not found' });
  const catalog = new Catalog(raw);
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, catalog.lineage, 'catalogs', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  if (updates.status) {
    await statusService.transition('catalog', catalog._id, updates.status, userId, userRole, updates.statusMeta || {});
    return await getById(uid);
  }

  if (updates.name) catalog.identity.name = updates.name;
  catalog.data = { ...catalog.data, ...(updates.data || {}) };

  await repository.updateById(uid, catalog);
  const updatedRaw = await repository.findById(uid);
  return new Catalog(updatedRaw);
}

export async function remove(uid, userId, userOrg, userRole, userPermissions) {
  const catalog = await getById(uid);
  if (!catalog) throw createError({ statusCode: 404, message: 'Catalog not found' });
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, catalog.lineage, 'catalogs', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  return await repository.deleteById(uid);
}
