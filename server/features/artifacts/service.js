/**
 * Artifacts Service
 */

import * as repository from './repository.js';
import { ObjectId } from 'mongodb';

export async function getById(id) {
  if (!ObjectId.isValid(id)) {
    throw createError({ statusCode: 400, message: 'Invalid ID format' });
  }
  
  const artifact = await repository.findById(id);
  if (!artifact) {
    throw createError({ statusCode: 404, message: 'Artifact not found' });
  }
  
  return artifact;
}

export async function listByQueue(queueId, options = {}) {
  if (!ObjectId.isValid(queueId)) {
    throw createError({ statusCode: 400, message: 'Invalid queue ID format' });
  }
  
  return await repository.findByQueue(queueId, options);
}

export async function create(data) {
  if (!data.type) {
    throw createError({ statusCode: 400, message: 'Type is required' });
  }
  if (!data.queueId) {
    throw createError({ statusCode: 400, message: 'Queue ID is required' });
  }
  if (!data.name) {
    throw createError({ statusCode: 400, message: 'Name is required' });
  }
  
  const validTypes = ['LAYOUT_SVG', 'LAYOUT_DXF', 'GCODE', 'PDF_PASSPORT', 'NESTING_REPORT'];
  if (!validTypes.includes(data.type)) {
    throw createError({ statusCode: 400, message: 'Invalid artifact type' });
  }
  
  return await repository.create({
    type: data.type,
    queueId: new ObjectId(data.queueId),
    projectId: data.projectId ? new ObjectId(data.projectId) : null,
    runId: data.runId ? new ObjectId(data.runId) : null,
    name: data.name,
    fileId: data.fileId || null,
    mimeType: data.mimeType || null,
    fileSize: data.fileSize || 0,
    metadata: data.metadata || {},
    generatedBy: data.generatedBy || null
  });
}

export async function updateStatus(id, status, fileData = {}) {
  const artifact = await getById(id);
  
  const validStatuses = ['GENERATING', 'READY', 'FAILED'];
  if (!validStatuses.includes(status)) {
    throw createError({ statusCode: 400, message: 'Invalid status' });
  }
  
  const updates = { status };
  if (fileData.fileId) updates.fileId = new ObjectId(fileData.fileId);
  if (fileData.fileSize) updates.fileSize = fileData.fileSize;
  if (fileData.mimeType) updates.mimeType = fileData.mimeType;
  
  await repository.updateById(id, updates);
  return await repository.findById(id);
}

export async function remove(id) {
  const artifact = await getById(id);
  
  // If there's a file associated, delete it from GridFS first
  if (artifact.fileId) {
    await repository.deleteFile(artifact.fileId);
  }
  
  // Then delete the artifact metadata document
  await repository.deleteById(id);
  
  return { id };
}
