/**
 * Batches Service
 */

import * as repository from './repository.js';
import { ObjectId } from 'mongodb';

export async function getById(id, userId) {
  if (!ObjectId.isValid(id)) {
    throw createError({ statusCode: 400, message: 'Invalid ID format' });
  }
  
  const batch = await repository.findById(id);
  if (!batch) {
    throw createError({ statusCode: 404, message: 'Batch not found' });
  }
  
  // Direct string comparison (userId is OAuth string)
  if (batch.ownerId !== userId) {
    throw createError({ statusCode: 403, message: 'Access denied' });
  }
  
  return batch;
}

export async function listByProject(projectSlug, userId, options = {}) {
  return await repository.findByProject(projectSlug, options);
}

export async function listForUser(userId, options = {}) {
  return await repository.findByOwner(userId, options);
}

export async function create(data, userId) {
  if (!data.projectSlug) {
    throw createError({ statusCode: 400, message: 'Project slug is required' });
  }
  if (!data.name) {
    throw createError({ statusCode: 400, message: 'Name is required' });
  }
  if (!Array.isArray(data.entries) || data.entries.length === 0) {
    throw createError({ statusCode: 400, message: 'At least one entry is required' });
  }
  
  // Validate entries
  for (const entry of data.entries) {
    if (!entry.entryId || !entry.cassetteTemplateId || !entry.quantity) {
      throw createError({ statusCode: 400, message: 'Invalid entry format' });
    }
    if (!ObjectId.isValid(entry.cassetteTemplateId)) {
      throw createError({ statusCode: 400, message: 'Invalid cassette template ID' });
    }
  }
  
  const batchNumber = await repository.getNextBatchNumber(data.projectSlug);
  
  return await repository.create({
    projectSlug: data.projectSlug,
    batchNumber,
    name: data.name,
    ownerId: userId,  // Store as string (OAuth format), not ObjectId
    entries: data.entries.map(e => ({
      ...e,
      cassetteTemplateId: new ObjectId(e.cassetteTemplateId)
    })),
    additionalFiles: data.additionalFiles || [],
    previousRemainder: data.previousRemainder || null
  });
}

export async function update(id, updates, userId) {
  await getById(id, userId);
  
  const allowedUpdates = ['name', 'entries', 'additionalFiles', 'previousRemainder', 'nestingParams', 'requestedArtifacts', 'pdfTemplateId', 'chosenRunId', 'status'];
  const filteredUpdates = {};
  
  for (const key of allowedUpdates) {
    if (updates[key] !== undefined) {
      filteredUpdates[key] = updates[key];
    }
  }
  
  if (Object.keys(filteredUpdates).length === 0) {
    throw createError({ statusCode: 400, message: 'No valid updates provided' });
  }
  
  await repository.updateById(id, filteredUpdates);
  return await repository.findById(id);
}

export async function updateStatus(id, status, userId) {
  const batch = await getById(id, userId);
  
  const validStatuses = ['DRAFT', 'CUT'];
  if (!validStatuses.includes(status)) {
    throw createError({ statusCode: 400, message: 'Invalid status' });
  }

  if (status === 'CUT' && !batch.chosenRunId) {
    throw createError({ statusCode: 400, message: 'Choose a completed run before marking as cut' });
  }
  
  await repository.updateById(id, { status });
  return await repository.findById(id);
}

export async function remove(id, userId) {
  const batch = await getById(id, userId);
  
  const hasNestingRun = (batch.runs || []).some(run => run.status === 'NESTING');
  if (hasNestingRun) {
    throw createError({ statusCode: 400, message: 'Cannot delete batch in progress' });
  }
  
  await repository.deleteById(id);
  return { success: true };
}

export async function getArtifacts(id, userId, options = {}) {
  const batch = await getById(id, userId);
  const query = { batchId: new ObjectId(id) };
  const runId = options.runId || batch.chosenRunId || null;
  if (runId) {
    query.runId = new ObjectId(runId);
  }

  // Get artifacts from artifacts collection
  const { connectDB } = await import('../../db/mongo.js');
  const db = await connectDB();
  
  const artifacts = await db.collection('artifacts')
    .find(query)
    .sort({ createdAt: -1 })
    .toArray();
  
  return artifacts;
}

export async function resetToDraft(id, userId) {
  const now = new Date();
  const updates = {
    status: 'DRAFT',
    updatedAt: now
  };

  await repository.updateById(id, updates);
  await repository.setRunsStatusByStatus(id, 'NESTING', 'ERROR');
  return await repository.findById(id);
}

export async function markCut(id, userId) {
  const batch = await getById(id, userId);
  if (batch.status === 'CUT') return batch;

  // Update status first
  const updatedBatch = await updateStatus(id, 'CUT', userId);

  // Record in project cutLogs
  const { connectDB } = await import('../../db/mongo.js');
  const db = await connectDB();
  
  const chosenRun = (batch.runs || []).find(r => r._id?.toString() === batch.chosenRunId?.toString());
  
  const logEntry = {
    batchId: batch._id,
    batchName: batch.name,
    date: new Date(),
    userId: userId,
    userName: userId.split(':')[0], // Basic placeholder
    sheetsUsed: chosenRun?.layoutCount || 0,
    utilization: 0.85, // Placeholder, should come from nesting report
    wasteArea: 1.2,    // Placeholder
    hasWastePolygons: true
  };

  await db.collection('projects').updateOne(
    { slug: batch.projectSlug, ownerId: userId },
    { $push: { cutLogs: logEntry } }
  );

  return updatedBatch;
}

export async function addRun(id, run, userId) {
  await getById(id, userId);
  const now = new Date();
  const normalizedRun = {
    _id: run._id || new ObjectId(),
    status: run.status || 'NESTING',
    createdAt: run.createdAt || now,
    updatedAt: run.updatedAt || now,
    ...run
  };
  await repository.addRun(id, normalizedRun);
  return await repository.findById(id);
}

export async function setRunStatus(id, runId, status, userId) {
  await getById(id, userId);
  const validStatuses = ['NESTING', 'ERROR', 'COMPLETE', 'CHOSEN'];
  if (!validStatuses.includes(status)) {
    throw createError({ statusCode: 400, message: 'Invalid run status' });
  }
  await repository.setRunStatus(id, runId, status);
  return await repository.findById(id);
}

export async function setRunsStatusByStatus(id, fromStatus, toStatus, userId) {
  await getById(id, userId);
  await repository.setRunsStatusByStatus(id, fromStatus, toStatus);
  return await repository.findById(id);
}

export async function chooseRun(id, runId, userId) {
  const batch = await getById(id, userId);
  const run = (batch.runs || []).find(item => item._id?.toString() === runId.toString());
  if (!run) {
    throw createError({ statusCode: 404, message: 'Run not found' });
  }
  if (run.status !== 'COMPLETE') {
    throw createError({ statusCode: 400, message: 'Run must be COMPLETE to choose' });
  }
  await repository.setChosenRun(id, runId);
  return await repository.findById(id);
}

export async function removeRun(id, runId, userId) {
  const batch = await getById(id, userId);
  const run = (batch.runs || []).find(item => item._id?.toString() === runId.toString());
  if (!run) {
    throw createError({ statusCode: 404, message: 'Run not found' });
  }
  
  if (run.status === 'NESTING') {
    throw createError({ statusCode: 400, message: 'Cannot delete run in progress' });
  }
  
  await repository.pullRun(id, runId);
  
  // If this was the chosen run, unset it
  if (batch.chosenRunId?.toString() === runId.toString()) {
    await repository.updateById(id, { chosenRunId: null });
  }
  
  // Also delete associated artifacts
  const { connectDB } = await import('../../db/mongo.js');
  const db = await connectDB();
  await db.collection('artifacts').deleteMany({
    batchId: new ObjectId(id),
    runId: new ObjectId(runId)
  });
  
  return await repository.findById(id);
}
