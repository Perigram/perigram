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
 * Get all active layer standards with their default pens
 */
export async function getAllWithPens() {
  const standards = await repository.findAllActive();
  const db = await connectDB();
  
  // Fetch all pens to avoid multiple queries
  const pens = await db.collection('pen_templates').find().toArray();
  const penMap = pens.reduce((acc, pen) => {
    acc[pen._id.toString()] = pen;
    return acc;
  }, {});
  
  return standards.map(std => ({
    ...std,
    defaultPen: std.defaultPenId ? penMap[std.defaultPenId.toString()] : null
  }));
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
    
    // Validate i18n has nameTemplate fields
    if (!std.i18n.en?.nameTemplate || !std.i18n.ru?.nameTemplate) {
      throw createError({ 
        statusCode: 400, 
        message: 'Invalid layer standard data: i18n.en.nameTemplate and i18n.ru.nameTemplate are required' 
      });
    }
    
    // Validate parameters array if present
    if (std.parameters && !Array.isArray(std.parameters)) {
      throw createError({ 
        statusCode: 400, 
        message: 'Invalid layer standard data: parameters must be an array' 
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
 * Generate layer name from template and parameters
 * Example: template="Cut_{diameter}" + params={diameter:3.15} = "Cut_3,15"
 */
export function generateLayerName(standard, parameters = {}, locale = 'en') {
  if (!standard || !standard.i18n || !standard.i18n[locale]) {
    throw createError({ statusCode: 400, message: 'Invalid layer standard or locale' });
  }
  
  let layerName = standard.i18n[locale].nameTemplate;
  
  // Substitute parameters
  if (standard.parameters && standard.parameters.length > 0) {
    for (const param of standard.parameters) {
      if (parameters[param] === undefined) {
        throw createError({ 
          statusCode: 400, 
          message: `Missing required parameter: ${param} for layer ${standard.code}` 
        });
      }
      
      // Format number with comma (Russian style)
      const value = typeof parameters[param] === 'number' 
        ? parameters[param].toString().replace('.', ',')
        : parameters[param];
      
      layerName = layerName.replace(`{${param}}`, value);
    }
  }
  
  // Prepend code
  return `${standard.code}_${layerName}`;
}

/**
 * Get count of layer standards
 */
export async function getCount() {
  return await repository.count();
}
