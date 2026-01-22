import * as repository from './repository.js';
import * as catalogRepository from '../catalogs/repository.js';
import { createError } from 'h3';
import { hasPermission } from '~/server/utils/auth-helpers';
import { checkEntityAccess } from '~/server/utils/permissions';
import { ObjectId } from 'mongodb';

export async function create(data, user) {
  const catalog = await catalogRepository.findById(data.catalogId);
  if (!catalog) throw createError({ statusCode: 404, message: 'Catalog not found' });
  
  if (!checkEntityAccess(user, catalog, catalog.manufacturerId)) {
    throw createError({ statusCode: 403, message: 'Access denied' });
  }

  if (!hasPermission(user, 'catalogs', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  return await repository.create(data);
}

export async function list(filter = {}) {
  // Publicly available for browsing
  return await repository.find(filter);
}

export async function update(id, updates, user) {
  const color = await repository.findById(id);
  if (!color) throw createError({ statusCode: 404, message: 'Color not found' });

  const catalog = await catalogRepository.findById(color.catalogId);
  if (!checkEntityAccess(user, catalog, catalog.manufacturerId)) {
    throw createError({ statusCode: 403, message: 'Access denied' });
  }

  delete updates._id;
  delete updates.createdAt;

  const success = await repository.updateById(id, updates);
  if (!success) {
    throw createError({ statusCode: 500, message: 'Update failed' });
  }

  return await repository.findById(id);
}

export async function remove(id, user) {
  const color = await repository.findById(id);
  if (!color) throw createError({ statusCode: 404, message: 'Color not found' });

  const catalog = await catalogRepository.findById(color.catalogId);
  if (!checkEntityAccess(user, catalog, catalog.manufacturerId)) {
    throw createError({ statusCode: 403, message: 'Access denied' });
  }

  return await repository.deleteById(id);
}
