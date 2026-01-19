/**
 * Cassettes Service
 */

import * as repository from './repository.js';
import { ObjectId } from 'mongodb';
import { connectDB } from '../../db/mongo.js';
import { GridFSBucket } from 'mongodb';
import { generateRandomString } from '../../utils/strings.js';
import standardSlugify from 'standard-slugify';
import { extractNestingPolygons } from '../../utils/dxf-extractor.js';
import { service as systemSettingsService } from '../system-settings/index.js';
import { createError } from 'h3';
import { hasPermission } from '~/server/utils/auth-helpers';

export async function upload(fileBuffer, fileName, cassetteName, userId, userOrg, userRole, userPermissions, layerMapping = null, parameters = null) {
  if (!hasPermission({ permissions: userPermissions }, 'cassettes', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  if (!fileBuffer || fileBuffer.length === 0) {
    throw createError({ statusCode: 400, message: 'No file data provided' });
  }
  
  const name = cassetteName || 'Unnamed Cassette';
  const slug = standardSlugify(fileName, { keepCase: false }) + `-${generateRandomString(6)}`;
  
  // Upload DXF to GridFS
  const db = await connectDB();
  const cassetteBucket = new GridFSBucket(db, { bucketName: 'cassettes' });
  
  const uploadStream = cassetteBucket.openUploadStream(slug + '.dxf', {
    metadata: { userId, originalName: fileName }
  });
  
  await new Promise((resolve, reject) => {
    uploadStream.on('finish', resolve);
    uploadStream.on('error', reject);
    uploadStream.write(fileBuffer);
    uploadStream.end();
  });
  
  // Default parameters if not provided
  const defaultParameters = parameters || ['A', 'B', 'C', 'D', 'E', 'F', 'horizontal_seam_width'];
  
  // Extract polygons from DXF for nesting
  // Only entities from the nesting layer (1_3_UNFOLD_BOUNDARY) are extracted
  let polygonParts = [];
  let nestingLayerCode = null;
  
  if (layerMapping && Object.keys(layerMapping).length > 0) {
    // Get system nesting layer code (default: "1_3_UNFOLD_BOUNDARY")
    nestingLayerCode = await systemSettingsService.getNestingLayerCode();
    console.log(`[Cassette Upload] Nesting layer code: ${nestingLayerCode}`);
    
    // Extract polygon coordinates + handles from nesting layer ONLY
    polygonParts = extractNestingPolygons(fileBuffer, layerMapping, nestingLayerCode);
    console.log(`[Cassette Upload] Extracted ${polygonParts.length} polygon parts from nesting layer`);
    
    if (polygonParts.length === 0) {
      console.warn(`[Cassette Upload] No polygons found in nesting layer. Check layer mapping.`);
    }
  } else {
    console.log('[Cassette Upload] No layer mapping provided, skipping polygon extraction');
  }
  
  // Create cassette document with polygonParts
  const cassetteData = {
    name,
    slug,
    userId: userId,  // Store as string
    ownerId: userId, // Add ownerId for consistency if we want to migrate later
    dxfId: uploadStream.id,
    svgId: null,  // SVG preview generation can happen later if needed
    layerMapping: layerMapping || {},  // Format: { [dxfLayerName]: layerStandardCode }
    nestingLayerCode: nestingLayerCode,  // Which layer standard code used for nesting
    parameters: defaultParameters,  // Parameter names for batch entries
    polygonParts: polygonParts,  // Extracted polygon data for nesting!
    polygonPartsCount: polygonParts.length,
    options: {
      hasIkleHoles: false,
      hasRivetHoles: false,
      allowRotation: true,
      negativeOffset: 0
    },
    processingStatus: polygonParts.length > 0 ? 'completed' : 'pending',
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  const cassette = await repository.create(cassetteData);
  
  // Sync to old schema for worker compatibility (ghcr.io/1suo)
  // Worker expects cassette in user_dxf_files collection with DXF in userDxf bucket
  await db.collection('user_dxf_files').updateOne(
    { slug: cassette.slug },
    { $set: cassette },
    { upsert: true }
  );
  
  // Copy DXF file to userDxf bucket (if not already there)
  const existingFile = await db.collection('userDxf.files').findOne({
    filename: cassette.slug
  });
  
  if (!existingFile && cassette.dxfId) {
    const srcFile = await db.collection('cassettes.files').findOne({
      _id: cassette.dxfId
    });
    
    if (srcFile) {
      await db.collection('userDxf.files').insertOne({
        _id: srcFile._id,
        filename: cassette.slug,
        length: srcFile.length,
        chunkSize: srcFile.chunkSize,
        uploadDate: srcFile.uploadDate,
        metadata: srcFile.metadata
      });
      
      const chunks = await db.collection('cassettes.chunks')
        .find({ files_id: cassette.dxfId })
        .toArray();
      
      if (chunks.length > 0) {
        await db.collection('userDxf.chunks').insertMany(chunks);
      }
      
      console.log(`[Cassette Upload] Synced DXF to userDxf bucket for worker compatibility`);
    }
  }
  
  console.log(`[Cassette Upload] Created cassette ${cassette._id} with ${polygonParts.length} polygon parts`);
  
  return cassette;
}

export async function getById(id, userId, userOrg, userRole, userPermissions) {
  if (!ObjectId.isValid(id)) {
    throw createError({ statusCode: 400, message: 'Invalid ID format' });
  }
  
  // Note: nesting uses this function internally sometimes without permissions object if called from other service?
  // We need to handle internal calls carefully. But typically internal calls should bypass service or mock permissions.
  // For now, we assume this is called from API/Context.
  
  if (userPermissions && !hasPermission({ permissions: userPermissions }, 'cassettes', 'read')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  let cassette = await repository.findById(id);
  
  if (!cassette) {
    // Try baked_cassettes
    const { connectDB } = await import('../../db/mongo.js');
    const db = await connectDB();
    cassette = await db.collection('baked_cassettes').findOne({ _id: new ObjectId(id) });
  }

  if (!cassette) {
    throw createError({ statusCode: 404, message: 'Cassette not found' });
  }
  
  // Access control
  if (userId && userRole !== 'SuperAdmin') {
      // Check ownership
      if (cassette.userId !== userId && cassette.ownerId !== userId) {
          throw createError({ statusCode: 403, message: 'Access denied' });
      }
  }
  
  return cassette;
}

export async function getBySlug(slug, userId, userOrg, userRole, userPermissions) {
  if (!hasPermission({ permissions: userPermissions }, 'cassettes', 'read')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const cassette = await repository.findBySlug(slug);
  if (!cassette) {
    throw createError({ statusCode: 404, message: 'Cassette not found' });
  }
  
  if (userRole !== 'SuperAdmin') {
      if (cassette.userId !== userId && cassette.ownerId !== userId) {
        throw createError({ statusCode: 403, message: 'Access denied' });
      }
  }
  return cassette;
}

export async function listForUser(userId, userOrg, userRole, userPermissions, options = {}) {
  if (!hasPermission({ permissions: userPermissions }, 'cassettes', 'read')) {
    return [];
  }
  
  if (userRole === 'SuperAdmin') {
      // Return all if SuperAdmin? Or just list all?
      // Repository findByOwner filters by owner. 
      // We might need a general list function in repository.
      // For now, let's just return user's cassettes.
      return await repository.findByOwner(userId, options);
  }
  
  return await repository.findByOwner(userId, options);
}

export async function create(data, userId, userOrg, userRole, userPermissions) {
  if (!hasPermission({ permissions: userPermissions }, 'cassettes', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  if (!data.name) {
    throw createError({ statusCode: 400, message: 'Name is required' });
  }
  
  const slug = data.slug || (data.data ? `parametric-${Date.now()}` : standardSlugify(data.name, { keepCase: false }) + `-${generateRandomString(6)}`);
  
  // Check slug uniqueness
  const existing = await repository.findBySlug(slug);
  if (existing) {
    throw createError({ statusCode: 409, message: 'Slug already exists' });
  }
  
  const cassetteData = {
    name: data.name,
    slug: slug,
    userId: userId,
    ownerId: userId,
    type: data.data ? 'PARAMETRIC' : 'STANDARD',
    data: data.data || null,
    dxfId: data.dxfId || null,
    svgId: data.svgId || null,
    layerMapping: data.layerMapping || {},
    parameters: data.data ? Object.keys(data.data.params || {}) : (data.parameters || []),
    processingStatus: data.data ? 'completed' : 'pending',
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  return await repository.create(cassetteData);
}

export async function update(id, data, userId, userOrg, userRole, userPermissions) {
  await getById(id, userId, userOrg, userRole, userPermissions);
  
  if (!hasPermission({ permissions: userPermissions }, 'cassettes', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const updates = {
    updatedAt: new Date()
  };
  
  if (data.name) updates.name = data.name;
  if (data.data) {
    updates.data = data.data;
    updates.parameters = Object.keys(data.data.params || {});
  }
  if (data.layerMapping) updates.layerMapping = data.layerMapping;
  if (data.parameters && !data.data) updates.parameters = data.parameters;
  
  await repository.updateById(id, updates);
  return await repository.findById(id);
}

export async function updateLayerMapping(id, layerMapping, userId, userOrg, userRole, userPermissions) {
  return await update(id, { layerMapping }, userId, userOrg, userRole, userPermissions);
}

export async function updateParameters(id, parameters, userId, userOrg, userRole, userPermissions) {
  return await update(id, { parameters }, userId, userOrg, userRole, userPermissions);
}

export async function updateStatus(id, status, userId, userOrg, userRole, userPermissions) {
  await getById(id, userId, userOrg, userRole, userPermissions);
  
  if (!hasPermission({ permissions: userPermissions }, 'cassettes', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const validStatuses = ['DRAFT', 'ACTIVE', 'ARCHIVED'];
  if (!validStatuses.includes(status)) {
    throw createError({ statusCode: 400, message: 'Invalid status' });
  }
  
  await repository.updateById(id, { status });
  return await repository.findById(id);
}

export async function remove(id, userId, userOrg, userRole, userPermissions) {
  await getById(id, userId, userOrg, userRole, userPermissions);
  
  if (!hasPermission({ permissions: userPermissions }, 'cassettes', 'write')) { // delete
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  await repository.deleteById(id);
  return { success: true };
}

export async function downloadDxf(id, userId, userOrg, userRole, userPermissions) {
  const cassette = await getById(id, userId, userOrg, userRole, userPermissions);
  if (!cassette.dxfId) {
    throw createError({ statusCode: 404, message: 'DXF not found for this cassette' });
  }
  
  const db = await connectDB();
  const bucket = new GridFSBucket(db, { bucketName: 'cassettes' });
  
  const downloadStream = bucket.openDownloadStream(cassette.dxfId);
  return downloadStream;
}
