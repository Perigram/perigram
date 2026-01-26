import * as repository from './repository.js';
import { createError } from 'h3';
import { hasLineagePermission } from '~/server/utils/permissions';
import { createIdentity, createStatus } from '~/server/utils/blocks';
import { statusService } from '~/server/core/machines/service';
import { mapLineageQuery } from '~/server/utils/query';
import { ObjectId } from 'mongodb';

/**
 * Catalogs Service - v24 Standardized
 */

export async function create(data, userId, userOrg, userRole, userPermissions) {
  const { name, material, pricing, options, manufacturerId } = data;

  const targetOrgId = userRole === 'SuperAdmin' ? (manufacturerId || userOrg) : userOrg;
  
  if (!targetOrgId) {
    throw createError({ statusCode: 400, message: 'Manufacturer organization required' });
  }

  const lineage = { organizationId: new ObjectId(targetOrgId) };

  // Permission Check
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, lineage, 'catalogs', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const origin = createStatus('ACTIVE', userId, { note: 'Catalog created' });

  const catalogData = {
    identity: createIdentity(name || 'New Catalog'),
    origin,
    status: origin,
    lineage,
    manufacturerId: lineage.organizationId,
    material: material || 'ALUMINUM',
    pricing: {
      pricePerSqm: pricing?.pricePerSqm || 0,
      currency: pricing?.currency || 'USD'
    },
    options: {
      sheetThicknesses: options?.sheetThicknesses || [],
      foilThicknesses: options?.foilThicknesses || [],
      widths: options?.widths || [],
      lengths: options?.lengths || []
    }
  };

  return await repository.create(catalogData);
}

export async function list(userId, userOrg, userRole, userPermissions, filter = {}) {
  // Logic: Contractors see all, Manufacturers see their own (implemented via filter in repo if needed)
  // For now, let's keep it simple and filter by membership if not SuperAdmin
  const finalFilter = mapLineageQuery(filter);
  
  if (userRole !== 'SuperAdmin') {
    // ...
  }
  return await repository.find(finalFilter);
}

export async function getById(id, userId, userOrg, userRole, userPermissions) {
  const catalog = await repository.findById(id);
  if (!catalog) {
    throw createError({ statusCode: 404, message: 'Catalog not found' });
  }
  return catalog;
}

export async function update(id, updates, userId, userOrg, userRole, userPermissions) {
  const catalog = await getById(id, userId, userOrg, userRole, userPermissions);
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, catalog.lineage, 'catalogs', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  if (updates.status) {
    await statusService.transition('catalog', catalog._id, updates.status, userId, userRole, updates.statusMeta || {});
    delete updates.status;
  }

  const { identity, origin, status, lineage, ...clean } = updates;
  
  if (updates.name) catalog.identity.name = updates.name;

  await repository.updateById(id, { identity: catalog.identity, ...clean });
  return await repository.findById(id);
}

export async function remove(id, userId, userOrg, userRole, userPermissions) {
  const catalog = await getById(id, userId, userOrg, userRole, userPermissions);
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, catalog.lineage, 'catalogs', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  return await repository.deleteById(id);
}
