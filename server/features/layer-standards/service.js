/**
 * Layer Standards Service
 * 
 * Business logic for layer standards.
 * Layer standards are system-managed, read-only for users.
 */

import * as repository from './repository.js';
import { ObjectId } from 'mongodb';

/**
 * Get all active layer standards
 */
export async function getAll() {
  return await repository.findAllActive();
}

/**
 * Get layer standards by category
 */
export async function getByCategory(category) {
  const validCategories = ['CONTOUR', 'CUT', 'BEND', 'MARKING'];
  
  if (!validCategories.includes(category)) {
    throw createError({ 
      statusCode: 400, 
      message: `Invalid category. Must be one of: ${validCategories.join(', ')}` 
    });
  }
  
  return await repository.findByCategory(category);
}

/**
 * Get layer standard by ID
 */
export async function getById(id) {
  if (!ObjectId.isValid(id)) {
    throw createError({ statusCode: 400, message: 'Invalid ID format' });
  }
  
  const standard = await repository.findById(id);
  
  if (!standard) {
    throw createError({ statusCode: 404, message: 'Layer standard not found' });
  }
  
  if (!standard.isActive) {
    throw createError({ statusCode: 404, message: 'Layer standard not found' });
  }
  
  return standard;
}

/**
 * Get layer standard by code
 */
export async function getByCode(code) {
  const standard = await repository.findByCode(code);
  
  if (!standard) {
    throw createError({ statusCode: 404, message: `Layer standard '${code}' not found` });
  }
  
  return standard;
}

/**
 * Seed layer standards from data
 * (Admin only - used for initial setup)
 */
export async function seed(standardsData) {
  // Validate data structure
  for (const std of standardsData) {
    if (!std.code || !std.category || !std.i18n) {
      throw createError({ 
        statusCode: 400, 
        message: 'Invalid layer standard data: code, category, and i18n are required' 
      });
    }
  }
  
  // Check if any standards already exist
  const existingCount = await repository.count();
  if (existingCount > 0) {
    throw createError({ 
      statusCode: 409, 
      message: 'Layer standards already exist. Drop existing standards before reseeding.' 
    });
  }
  
  return await repository.bulkCreate(standardsData);
}

/**
 * Get count of layer standards
 */
export async function getCount() {
  return await repository.count();
}
