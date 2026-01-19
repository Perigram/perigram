import * as repository from './repository.js';
import { createError } from 'h3';
import { hasPermission } from '~/server/utils/auth-helpers';
import { getOrgFilter, checkEntityAccess } from '~/server/utils/permissions';
import { ObjectId } from 'mongodb';

export async function create(data, user) {
  // Only manufacturer admins can create catalogs
  if (!hasPermission(user, 'materials', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  // User must belong to Manufacturer organization
  const org = user.organizationData;
  if (!org || org.type !== 'Manufacturer') {
    throw createError({ statusCode: 403, message: 'Only manufacturers can create catalogs' });
  }
  
  // Validate required fields
  if (!data.name || !data.manufacturerId) {
    throw createError({ statusCode: 400, message: 'Name and manufacturerId required' });
  }
  
  // Verify manufacturerId matches user's organization
  if (data.manufacturerId !== user.organizationId.toString()) {
    throw createError({ statusCode: 403, message: 'Cannot create catalog for other manufacturer' });
  }
  
  return await repository.create({
    name: data.name,
    manufacturerId: new ObjectId(data.manufacturerId),
    description: data.description || '',
    sheetTypes: []
  });
}

export async function list(user, filter = {}) {
  // Contractors can see all catalogs
  // Manufacturers see only their own
  const org = user.organizationData;
  if (org && org.type === 'Manufacturer') {
    filter.manufacturerId = user.organizationId;
  }
  
  return await repository.find(filter);
}

export async function getById(id, user) {
  const catalog = await repository.findById(id);
  if (!catalog) {
    throw createError({ statusCode: 404, message: 'Catalog not found' });
  }
  
  // Contractors can view all, manufacturers only their own
  const org = user.organizationData;
  if (org && org.type === 'Manufacturer') {
    if (!checkEntityAccess(user, catalog, catalog.manufacturerId)) {
      throw createError({ statusCode: 403, message: 'Cannot view catalog from other manufacturer' });
    }
  }
  
  return catalog;
}

export async function update(id, updates, user) {
  const catalog = await repository.findById(id);
  if (!catalog) {
    throw createError({ statusCode: 404, message: 'Catalog not found' });
  }
  
  // Only manufacturer that owns catalog can update
  if (!checkEntityAccess(user, catalog, catalog.manufacturerId)) {
    throw createError({ statusCode: 403, message: 'Cannot update catalog from other manufacturer' });
  }
  
  if (!hasPermission(user, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  // Don't allow manufacturerId change
  delete updates.manufacturerId;
  delete updates.sheetTypes;
  
  const success = await repository.updateById(id, updates);
  if (!success) {
    throw createError({ statusCode: 500, message: 'Update failed' });
  }
  
  return await repository.findById(id);
}

export async function addSheetType(catalogId, sheetTypeData, user) {
  const catalog = await repository.findById(catalogId);
  if (!catalog) {
    throw createError({ statusCode: 404, message: 'Catalog not found' });
  }
  
  // Only manufacturer that owns catalog can add sheet types
  if (!checkEntityAccess(user, catalog, catalog.manufacturerId)) {
    throw createError({ statusCode: 403, message: 'Cannot modify catalog from other manufacturer' });
  }
  
  if (!hasPermission(user, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  // Validate sheet type
  if (!sheetTypeData.material || !sheetTypeData.color || !sheetTypeData.thickness) {
    throw createError({ statusCode: 400, message: 'Material, color, and thickness required' });
  }
  
  const sheetType = await repository.addSheetType(catalogId, sheetTypeData);
  if (!sheetType) {
    throw createError({ statusCode: 500, message: 'Failed to add sheet type' });
  }
  
  return sheetType;
}

export async function updateSheetType(catalogId, sheetTypeId, updates, user) {
  const catalog = await repository.findById(catalogId);
  if (!catalog) {
    throw createError({ statusCode: 404, message: 'Catalog not found' });
  }
  
  if (!checkEntityAccess(user, catalog, catalog.manufacturerId)) {
    throw createError({ statusCode: 403, message: 'Cannot modify catalog from other manufacturer' });
  }
  
  if (!hasPermission(user, 'materials', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  // Don't allow _id change
  delete updates._id;
  
  const success = await repository.updateSheetType(catalogId, sheetTypeId, updates);
  if (!success) {
    throw createError({ statusCode: 404, message: 'Sheet type not found' });
  }
  
  return await repository.findById(catalogId);
}

export async function removeSheetType(catalogId, sheetTypeId, user) {
  const catalog = await repository.findById(catalogId);
  if (!catalog) {
    throw createError({ statusCode: 404, message: 'Catalog not found' });
  }
  
  if (!checkEntityAccess(user, catalog, catalog.manufacturerId)) {
    throw createError({ statusCode: 403, message: 'Cannot modify catalog from other manufacturer' });
  }
  
  if (!hasPermission(user, 'materials', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  const success = await repository.removeSheetType(catalogId, sheetTypeId);
  if (!success) {
    throw createError({ statusCode: 404, message: 'Sheet type not found' });
  }
  
  return { success: true };
}

export async function remove(id, user) {
  if (!hasPermission(user, 'materials', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  const catalog = await repository.findById(id);
  if (!catalog) {
    throw createError({ statusCode: 404, message: 'Catalog not found' });
  }
  
  if (!checkEntityAccess(user, catalog, catalog.manufacturerId)) {
    throw createError({ statusCode: 403, message: 'Cannot delete catalog from other manufacturer' });
  }
  
  const success = await repository.deleteById(id);
  if (!success) {
    throw createError({ statusCode: 404, message: 'Catalog not found' });
  }
  
  return { success: true };
}
