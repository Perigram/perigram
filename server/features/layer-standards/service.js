import * as repository from './repository.js';
import { createError } from 'h3';
import { createIdentity } from '~/server/utils/blocks';
import { ObjectId } from 'mongodb';

/**
 * Layer Standards Service - v24 Standardized
 */

export async function create(data, userId, userOrg, userRole, userPermissions) {
  const { code, category, name, i18n, parameters, defaultPenId } = data;

  const lineage = userOrg ? { organizationId: new ObjectId(userOrg) } : {};

  const standardData = {
    identity: createIdentity(name || code),
    lineage,
    config: {
      code,
      category,
      defaultPenId: defaultPenId ? new ObjectId(defaultPenId) : null,
      i18n: i18n || { en: { nameTemplate: name }, ru: { nameTemplate: name } },
      parameters: parameters || []
    }
  };

  return await repository.create(standardData);
}

export async function list(filter = {}) {
  return await repository.find(filter);
}

export async function getByCode(code) {
  const standard = await repository.findByCode(code);
  if (!standard) {
    throw createError({ statusCode: 404, message: `Layer standard '${code}' not found` });
  }
  return standard;
}

export async function getById(id) {
  const standard = await repository.findById(id);
  if (!standard) {
    throw createError({ statusCode: 404, message: 'Layer standard not found' });
  }
  return standard;
}

/**
 * Generate layer name from template and parameters
 * Example: template="Cut_{diameter}" + params={diameter:3.15} = "Cut_3,15"
 */
export function generateLayerName(standard, parameters = {}, locale = 'en') {
  const config = standard.config || standard; // support legacy
  const i18n = config.i18n || {};
  
  if (!i18n[locale]) {
    throw createError({ statusCode: 400, message: 'Invalid locale' });
  }
  
  let layerName = i18n[locale].nameTemplate;
  
  // Substitute parameters
  if (config.parameters && config.parameters.length > 0) {
    for (const param of config.parameters) {
      if (parameters[param] === undefined) {
        throw createError({ 
          statusCode: 400, 
          message: `Missing required parameter: ${param} for layer ${config.code}` 
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
  return `${config.code}_${layerName}`;
}