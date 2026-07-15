import * as repository from './repository.js';
import { createError } from 'h3';
import { createIdentity, createData, createStatus, Lineage } from '../../core/blocks/index.js';
import { toFlexibleId } from '../../utils/objectid.js';
import { LayerStandard } from './model.js';
import { markPublicSystemData } from '#shared/public-entities.js';

/**
 * Layer Standards Service - v24 Standardized
 */

function toDTO(standard) {
  if (!standard) return null;
  return new LayerStandard(standard).toJSON();
}

function buildLayerStandardDocument(data, userId, userOrg) {
  const {
    code,
    category,
    name,
    i18n,
    parameters,
    defaultPenId,
    group,
    kind,
    purpose,
    production,
    allowedGeometry,
    aliases,
    defaultExport,
    parameterSchema,
    description,
    source
  } = data;
  const lineage = userOrg ? new Lineage().add('organization', userOrg) : {};
  const origin = createStatus('ACTIVE', userId || 'SYSTEM', { note: 'Layer standard created' });

  const doc = {
    identity: createIdentity(name || code),
    origin,
    status: origin,
    lineage,
    data: createData({
      code,
      category,
      defaultPenId: defaultPenId ? toFlexibleId(defaultPenId) : null,
      i18n: i18n || { en: { nameTemplate: name }, ru: { nameTemplate: name } },
      parameters: parameters || [],
      group: group || null,
      kind: kind || null,
      purpose: purpose || null,
      production: Boolean(production),
      allowedGeometry: allowedGeometry || [],
      aliases: aliases || [],
      defaultExport: defaultExport || {},
      parameterSchema: parameterSchema || {},
      description: description || '',
      source: source || null
    })
  };
  return userOrg ? doc : markPublicSystemData(doc);
}

export async function create(data, userId, userOrg, userRole, userPermissions) {
  const standardData = buildLayerStandardDocument(data, userId, userOrg);

  const created = await repository.create(standardData);
  return toDTO(created);
}

export async function list(filter = {}) {
  const standards = await repository.find(filter);
  return standards.map(toDTO);
}

export async function getAll() {
  return await list({});
}

export async function getCount(filter = {}) {
  return await repository.count(filter);
}

export async function seed(standards = []) {
  const created = {};
  for (const standard of standards) {
    const existing = await repository.findByCode(standard.code);
    if (existing) {
      const next = buildLayerStandardDocument(standard, 'SYSTEM');
      await repository.updateById(existing._id, {
        identity: next.identity,
        data: next.data
      });
      created[standard.code] = existing._id;
      continue;
    }
    const result = await create(standard, 'SYSTEM');
    created[standard.code] = result._id;
  }
  return created;
}

export async function getByCategory(category) {
  return await list({ 'data.category': category });
}

export async function getByCode(code) {
  const standard = await repository.findByCode(code);
  if (!standard) {
    throw createError({ statusCode: 404, message: `Layer standard '${code}' not found` });
  }
  return toDTO(standard);
}

export async function getById(id) {
  const standard = await repository.findById(id);
  if (!standard) {
    throw createError({ statusCode: 404, message: 'Layer standard not found' });
  }
  return toDTO(standard);
}

/**
 * Generate layer name from template and parameters
 * Example: template="Cut_{diameter}" + params={diameter:3.15} = "Cut_3,15"
 */
export function generateLayerName(standard, parameters = {}, locale = 'en') {
  const config = standard.data || standard; // support both DTO and raw
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

// --- Org-level pen overrides ---

export async function getOverridesForOrg(organizationId) {
  return await repository.findOverridesByOrg(organizationId);
}

export async function setOrgOverride(organizationId, standardId, penId) {
  await repository.upsertOverride(organizationId, standardId, penId);
}

export async function removeOrgOverride(organizationId, standardId) {
  await repository.deleteOverride(organizationId, standardId);
}
