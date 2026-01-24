import * as repository from './repository.js';
import * as catalogRepository from '../catalogs/repository.js';
import { createError } from 'h3';
import { hasLineagePermission } from '~/server/utils/permissions';
import { createIdentity, inheritLineage } from '~/server/utils/blocks';
import { ObjectId } from 'mongodb';

/**
 * Colors Service - v24 Standardized
 */

export async function create(data, userId, userOrg, userRole, userPermissions) {
  const { catalogId, name, code, hexCode, textureUrl } = data;

  if (!catalogId) {
    throw createError({ statusCode: 400, message: 'catalogId is required' });
  }

  const catalog = await catalogRepository.findById(catalogId);
  if (!catalog) {
    throw createError({ statusCode: 404, message: 'Catalog not found' });
  }

  // 1. Lineage Inheritance
  const lineage = inheritLineage(catalog, 'catalog');

  // 2. Permission Check (on the catalog's organization)
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, lineage, 'catalogs', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const colorData = {
    identity: {
      ...createIdentity(name || 'New Color'),
      code: code || ''
    },
    visuals: {
      hexCode: hexCode || '#cccccc',
      textureUrl: textureUrl || null
    },
    lineage
  };

  return await repository.create(colorData);
}

export async function list(userId, userOrg, userRole, userPermissions, filter = {}) {
  // Publicly available
  return await repository.find(filter);
}

export async function getById(id) {
  const color = await repository.findById(id);
  if (!color) {
    throw createError({ statusCode: 404, message: 'Color not found' });
  }
  return color;
}

export async function update(id, updates, userId, userOrg, userRole, userPermissions) {
  const color = await getById(id);
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, color.lineage, 'catalogs', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const { identity, lineage, visuals, ...clean } = updates;
  
  // Identity updates
  if (updates.name) color.identity.name = updates.name;
  if (updates.code) color.identity.code = updates.code;

  await repository.updateById(id, { identity: color.identity, ...clean });
  return await repository.findById(id);
}

export async function remove(id, userId, userOrg, userRole, userPermissions) {
  const color = await getById(id);
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, color.lineage, 'catalogs', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  return await repository.deleteById(id);
}