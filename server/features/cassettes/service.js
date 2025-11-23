/**
 * Cassettes Service
 */

import * as repository from './repository.js';
import { ObjectId } from 'mongodb';
import { connectDB } from '../../db/mongo.js';
import { GridFSBucket } from 'mongodb';
import { generateRandomString } from '../../utils/strings.js';
import standardSlugify from 'standard-slugify';

export async function upload(fileBuffer, fileName, cassetteName, userId, layerMapping = null) {
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
  
  // Create cassette document (client already parsed layers)
  const cassetteData = {
    name,
    slug,
    userId: userId,  // Old schema uses userId as string (not ObjectId)
    dxfId: uploadStream.id,
    svgId: null,  // SVG preview generation can happen later if needed
    layerMapping: layerMapping || {},  // Format: { [layerName]: layerStandardCode }
    processingStatus: 'done',  // No async processing needed
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  const cassette = await repository.create(cassetteData);
  
  // No worker needed - client already detected layers
  
  return cassette;
}

export async function getById(id, userId) {
  if (!ObjectId.isValid(id)) {
    throw createError({ statusCode: 400, message: 'Invalid ID format' });
  }
  
  const cassette = await repository.findById(id);
  if (!cassette) {
    throw createError({ statusCode: 404, message: 'Cassette not found' });
  }
  if (cassette.userId !== userId) {  // Direct string comparison
    throw createError({ statusCode: 403, message: 'Access denied' });
  }
  
  return cassette;
}

export async function getBySlug(slug, userId) {
  const cassette = await repository.findBySlug(slug);
  if (!cassette) {
    throw createError({ statusCode: 404, message: 'Cassette not found' });
  }
  if (cassette.userId !== userId) {  // Direct string comparison
    throw createError({ statusCode: 403, message: 'Access denied' });
  }
  return cassette;
}

export async function listForUser(userId, options = {}) {
  return await repository.findByOwner(userId, options);
}

export async function create(data, userId) {
  if (!data.name) {
    throw createError({ statusCode: 400, message: 'Name is required' });
  }
  if (!data.slug) {
    throw createError({ statusCode: 400, message: 'Slug is required' });
  }
  
  // Check slug uniqueness
  const existing = await repository.findBySlug(data.slug);
  if (existing) {
    throw createError({ statusCode: 409, message: 'Slug already exists' });
  }
  
  return await repository.create({
    name: data.name,
    slug: data.slug,
    ownerId: new ObjectId(userId),
    dxfId: data.dxfId || null,
    svgId: data.svgId || null,
    layerMappings: data.layerMappings || [],
    parameters: data.parameters || [],
    boundingBox: data.boundingBox || null,
    area: data.area || 0,
    defaultMaterial: data.defaultMaterial || null
  });
}

export async function updateLayerMapping(id, layerMapping, userId) {
  await getById(id, userId);
  
  if (!layerMapping || typeof layerMapping !== 'object') {
    throw createError({ statusCode: 400, message: 'Layer mapping must be an object' });
  }
  
  await repository.updateById(id, { 
    layerMapping,
    updatedAt: new Date()
  });
  return await repository.findById(id);
}

export async function updateParameters(id, parameters, userId) {
  await getById(id, userId);
  
  if (!Array.isArray(parameters)) {
    throw createError({ statusCode: 400, message: 'Parameters must be an array' });
  }
  
  await repository.updateById(id, { parameters });
  return await repository.findById(id);
}

export async function updateStatus(id, status, userId) {
  await getById(id, userId);
  
  const validStatuses = ['DRAFT', 'ACTIVE', 'ARCHIVED'];
  if (!validStatuses.includes(status)) {
    throw createError({ statusCode: 400, message: 'Invalid status' });
  }
  
  await repository.updateById(id, { status });
  return await repository.findById(id);
}

export async function remove(id, userId) {
  await getById(id, userId);
  await repository.deleteById(id);
  return { success: true };
}
