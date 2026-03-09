import * as repository from './repository.js';
import * as designRepository from '../cassette-designs/repository.js';
import { createError } from 'h3';
import { hasLineagePermission, getLineageFilter } from '../../utils/permissions.js';
import { 
  createIdentity, 
  createStatus, 
  inheritLineage, 
  createData,
  registerService 
} from '../../core/blocks/index.js';
import { statusService } from '../../core/machines/service.js';
import { mapLineageQuery } from '../../utils/query.js';
import standardSlugify from 'standard-slugify';
import { generateRandomString } from '../../utils/strings.js';
import { ObjectId, GridFSBucket } from 'mongodb';
import { connectDB } from '../../db/mongo.js';
import { toFlexibleId } from '../../utils/objectid.js';
import { Cassette } from './model.js';

/**
 * Cassette Templates Service - v24 Standardized
 */

registerService('cassette', {
  getById: (uid) => getById(uid)
});

function toDTO(cassette) {
  if (!cassette) return null;
  return new Cassette(cassette).toJSON();
}

export async function create(data, userId, userOrg, userRole, userPermissions) {
  // Lineage: Templates belong to the organization
  const targetOrgId = userOrg || userId;
  const lineage = { organizationId: toFlexibleId(targetOrgId) };

  if (userPermissions && !hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, lineage, 'cassettes', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied for cassettes' });
  }

  const slug = data.slug || `${standardSlugify(data.name || 'template', { keepCase: false })}-${generateRandomString(6)}`;
  const origin = createStatus('ACTIVE', userId, { note: 'Template created' });

  const cassetteData = {
    identity: createIdentity(data.name || 'New Template', slug),
    origin,
    status: origin,
    lineage,
    data: createData({
        type: data.type || 'PARAMETRIC', // PARAMETRIC | STANDARD
        definition: data.definition || data.data || null,
        parameters: data.parameters || []
    })
  };

  const cassette = await repository.create(cassetteData);
  return toDTO(cassette);
}

export async function upload(fileBuffer, fileName, name, userId, userOrg, userRole, userPermissions, mapping, parameters) {
  const targetOrgId = userOrg || userId;
  const lineage = { organizationId: toFlexibleId(targetOrgId) };

  if (userPermissions && !hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, lineage, 'cassettes', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const db = await connectDB();
  const bucket = new GridFSBucket(db, { bucketName: 'cassettes' });
  const uploadStream = bucket.openUploadStream(fileName, {
    metadata: { userId, organizationId: targetOrgId }
  });

  await new Promise((resolve, reject) => {
    uploadStream.on('finish', resolve);
    uploadStream.on('error', reject);
    uploadStream.write(fileBuffer);
    uploadStream.end();
  });

  // 1. Create Template
  const slug = `${standardSlugify(name || fileName, { keepCase: false })}-${generateRandomString(6)}`;
  const origin = createStatus('ACTIVE', userId, { note: 'Standard template uploaded' });

  const templateData = {
    identity: createIdentity(name || fileName, slug),
    origin,
    status: origin,
    lineage,
    data: createData({
      type: 'STANDARD',
      definition: { mapping: mapping || {} },
      parameters: parameters || []
    })
  };

  const template = await repository.create(templateData);

  // 2. Create Design (Baked Geometry)
  const designOrigin = createStatus('ACTIVE', userId, { note: 'Initial design from upload' });
  const designData = {
    identity: createIdentity(`${name || fileName} (Base Design)`),
    origin: designOrigin,
    status: designOrigin,
    lineage: {
      ...lineage,
      templateId: template._id
    },
    data: createData({
      geometry: {
        data: null,
        dxfId: uploadStream.id
      },
      parameters: {}
    })
  };

  await designRepository.create(designData);

  return toDTO(template);
}

export async function list(userId, userOrg, userRole, userPermissions, query = {}) {
  const { limit, skip, status, ...rest } = query;
  
  const lineageFilter = getLineageFilter({ memberships: userPermissions.memberships, role: userRole });
  const processedFilter = { ...rest };
  
  if (status) {
    processedFilter['status.state'] = status;
  }
  
  if (userRole !== 'SuperAdmin') {
      const targetOrgId = userOrg || userId;
      processedFilter['lineage.organizationId'] = toFlexibleId(targetOrgId);
  }
  
  const finalFilter = { ...lineageFilter, ...processedFilter };
  
  const cassettes = await repository.find(finalFilter, { 
    limit: limit ? parseInt(limit) : 100, 
    skip: skip ? parseInt(skip) : 0 
  });
  
  return cassettes.map(toDTO);
}

export async function getById(id, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(toFlexibleId(id));
  if (!raw) throw createError({ statusCode: 404, message: 'Template not found' });
  
  const cassette = new Cassette(raw);
  
  if (userPermissions && !hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, cassette.lineage, 'cassettes', 'read')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  return cassette.toJSON();
}

export async function exportDxf(id, dimensions, userId, userOrg, userRole, userPermissions) {
  const template = await getById(id, userId, userOrg, userRole, userPermissions);
  
  if (template.type === 'PARAMETRIC') {
    const { evaluateTemplate, generateSimpleDxf } = await import('../parametric-cassettes/service.js');
    const { polygons } = await evaluateTemplate(id, dimensions || {});
    return generateSimpleDxf(polygons);
  } else {
    // For standard templates, find the associated design's DXF
    const db = await connectDB();
    const design = await db.collection('cassette_designs').findOne({ 'lineage.templateId': toFlexibleId(id) });
    
    if (!design?.data?.geometry?.dxfId) {
      throw createError({ statusCode: 404, message: 'DXF not found for this template' });
    }
    
    const bucket = new GridFSBucket(db, { bucketName: 'cassettes' });
    return bucket.openDownloadStream(toFlexibleId(design.data.geometry.dxfId));
  }
}

export async function update(id, updates, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(toFlexibleId(id));
  if (!raw) throw createError({ statusCode: 404, message: 'Template not found' });
  const cassette = new Cassette(raw);
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, cassette.lineage, 'cassettes', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  if (updates.status && typeof updates.status === 'string') {
    await statusService.transition('cassette', cassette._id, updates.status, userId, userRole, updates.statusMeta || {});
    delete updates.status;
  }

  const { identity, origin, status, lineage, data: updatesData, ...clean } = updates;
  
  if (updates.name) cassette.identity.name = updates.name;
  
  const cassetteData = {
    ...cassette.data,
    ...updatesData,
    ...clean
  };

  await repository.updateById(id, { identity: cassette.identity, data: cassetteData });
  const updatedRaw = await repository.findById(id);
  return new Cassette(updatedRaw).toJSON();
}

export async function updateLayerMapping(id, mapping, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(toFlexibleId(id));
  if (!raw) throw createError({ statusCode: 404, message: 'Template not found' });
  const cassette = new Cassette(raw);
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, cassette.lineage, 'cassettes', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const data = {
    ...cassette.data,
    definition: {
      ...(cassette.data?.definition || {}),
      mapping: mapping
    }
  };

  await repository.updateById(id, { data });
  const updatedRaw = await repository.findById(id);
  return new Cassette(updatedRaw).toJSON();
}

export async function updateParameters(id, parameters, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(toFlexibleId(id));
  if (!raw) throw createError({ statusCode: 404, message: 'Template not found' });
  const cassette = new Cassette(raw);
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, cassette.lineage, 'cassettes', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const data = {
    ...cassette.data,
    parameters: parameters
  };

  await repository.updateById(id, { data });
  const updatedRaw = await repository.findById(id);
  return new Cassette(updatedRaw).toJSON();
}

export async function remove(id, userId, userOrg, userRole, userPermissions) {
  const cassette = await getById(toFlexibleId(id), userId, userOrg, userRole, userPermissions);
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, cassette.lineage, 'cassettes', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  return await repository.deleteById(id);
}
