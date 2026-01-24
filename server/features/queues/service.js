import * as repository from './repository.js';
import { ObjectId } from 'mongodb';
import { createError } from 'h3';
import { hasPermission } from '~/server/utils/auth-helpers';
import * as cassetteInstanceService from '../cassette-instances/service.js';
import { initializeStatus, addStatus } from '~/server/features/statuses/service';

export async function getById(id, userId, userOrg, userRole, userPermissions) {
  if (!ObjectId.isValid(id)) {
    throw createError({ statusCode: 400, message: 'Invalid ID format' });
  }
  
  if (!hasPermission({ permissions: userPermissions }, 'queues', 'read')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  const queue = await repository.findById(id);
  if (!queue) {
    throw createError({ statusCode: 404, message: 'Queue not found' });
  }
  
  // Access control
  if (userRole !== 'SuperAdmin') {
      // Check ownership
      if (queue.ownerId !== userId) {
          // TODO: Add org-based check if ownerId is different but in same org
          // For now, strict owner check or SuperAdmin
          throw createError({ statusCode: 403, message: 'Access denied' });
      }
  }
  
  return queue;
}

export async function listByProject(projectSlug, userId, userOrg, userRole, userPermissions, options = {}) {
  if (!hasPermission({ permissions: userPermissions }, 'queues', 'read')) {
    return [];
  }
  return await repository.findByProject(projectSlug, options);
}

export async function listForUser(userId, options = {}) {
  // Internal or simple list
  return await repository.findByOwner(userId, options);
}

export async function create(data, userId, userOrg, userRole, userPermissions) {
  if (!hasPermission({ permissions: userPermissions }, 'queues', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

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
  
  const queueNumber = await repository.getNextQueueNumber(data.projectSlug);
  
  const queue = await repository.create({
    projectSlug: data.projectSlug,
    queueNumber,
    name: data.name,
    ownerId: userId,  // Store as string (OAuth format), not ObjectId
    entries: data.entries.map(e => ({
      ...e,
      cassetteTemplateId: new ObjectId(e.cassetteTemplateId)
    })),
    additionalFiles: data.additionalFiles || [],
    previousRemainder: data.previousRemainder || null
  });

  // Initialize status with Status Service
  await initializeStatus('queues', queue._id.toString(), userId, 'Queue created');

  // Update project queue count
  const { connectDB } = await import('../../db/mongo.js');
  const db = await connectDB();
  await db.collection('projects').updateOne(
    { slug: data.projectSlug },
    { $inc: { queueCount: 1 } }
  );

  return queue;
}

export async function update(id, updates, userId, userOrg, userRole, userPermissions) {
  await getById(id, userId, userOrg, userRole, userPermissions);
  
  if (!hasPermission({ permissions: userPermissions }, 'queues', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
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

export async function updateStatus(id, status, userId, userOrg, userRole, userPermissions) {
  const queue = await getById(id, userId, userOrg, userRole, userPermissions);
  
  if (!hasPermission({ permissions: userPermissions }, 'queues', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  const validStatuses = ['DRAFT', 'CUT'];
  if (!validStatuses.includes(status)) {
    throw createError({ statusCode: 400, message: 'Invalid status' });
  }

  if (status === 'CUT' && !queue.chosenRunId) {
    throw createError({ statusCode: 400, message: 'Choose a completed run before marking as cut' });
  }
  
  await repository.updateById(id, { status });
  return await repository.findById(id);
}

export async function remove(id, userId, userOrg, userRole, userPermissions) {
  const queue = await getById(id, userId, userOrg, userRole, userPermissions);
  
  if (!hasPermission({ permissions: userPermissions }, 'queues', 'write')) { // delete usually requires write or admin
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  const hasNestingRun = (queue.runs || []).some(run => run.status === 'NESTING');
  if (hasNestingRun) {
    throw createError({ statusCode: 400, message: 'Cannot delete queue in progress' });
  }
  
  await repository.deleteById(id);
  return { success: true };
}

export async function getArtifacts(id, userId, userOrg, userRole, userPermissions, options = {}) {
  const queue = await getById(id, userId, userOrg, userRole, userPermissions);
  const query = { queueId: new ObjectId(id) };
  const runId = options.runId || queue.chosenRunId || null;
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

export async function resetToDraft(id, userId, userOrg, userRole, userPermissions) {
  // Ensure check
  await getById(id, userId, userOrg, userRole, userPermissions);
  if (!hasPermission({ permissions: userPermissions }, 'queues', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const now = new Date();
  const updates = {
    status: 'DRAFT',
    updatedAt: now
  };

  await repository.updateById(id, updates);
  await addStatus('queues', id, 'draft', userId, 'Queue reset to draft');
  await repository.setRunsStatusByStatus(id, 'NESTING', 'ERROR');
  return await repository.findById(id);
}

export async function markCut(id, userId, userOrg, userRole, userPermissions) {
  const queue = await getById(id, userId, userOrg, userRole, userPermissions);
  
  if (!hasPermission({ permissions: userPermissions }, 'queues', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  if (!queue.chosenRunId) {
    throw createError({ statusCode: 400, message: 'Choose a completed run before marking as cut' });
  }
  
  const { connectDB } = await import('../../db/mongo.js');
  const db = await connectDB();

  // Check if already logged
  const existingLog = await db.collection('projects').findOne({
    slug: queue.projectSlug,
    ownerId: userId,
    "cutLogs.queueId": queue._id
  });

  if (existingLog) {
    // Already in logs, just ensure queue status is CUT
    if (queue.status !== 'CUT') {
      await addStatus('queues', id, 'CUT', userId, 'Ensuring status is CUT');
    }
    return await getById(id, userId, userOrg, userRole, userPermissions);
  }

  // Update status
  await addStatus('queues', id, 'CUT', userId, 'Queue marked as cut');
  const updatedQueue = await getById(id, userId, userOrg, userRole, userPermissions);

  // Create cassette instances
  await cassetteInstanceService.createFromQueue(queue, { userId });

  // Record in project cutLogs
  const chosenRun = (queue.runs || []).find(r => r._id?.toString() === queue.chosenRunId?.toString());
  
  const logEntry = {
    queueId: queue._id,
    queueName: queue.name,
    date: new Date(),
    userId: userId,
    userName: userId.split(':')[0], // Simple username fallback
    sheetsUsed: chosenRun?.layoutCount || 0,
    utilization: 0.85,
    wasteArea: 1.2,
    hasWastePolygons: true
  };

  await db.collection('projects').updateOne(
    { slug: queue.projectSlug, ownerId: userId },
    { $push: { cutLogs: logEntry } }
  );

  return updatedQueue;
}

export async function addRun(id, run, userId, userOrg, userRole, userPermissions) {
  await getById(id, userId, userOrg, userRole, userPermissions);
  if (!hasPermission({ permissions: userPermissions }, 'queues', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

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

export async function setRunStatus(id, runId, status, userId, userOrg, userRole, userPermissions) {
  await getById(id, userId, userOrg, userRole, userPermissions);
  // This is usually internal/system action, but if exposed:
  // if (!hasPermission...) 
  
  const validStatuses = ['NESTING', 'ERROR', 'COMPLETE', 'CHOSEN'];
  if (!validStatuses.includes(status)) {
    throw createError({ statusCode: 400, message: 'Invalid run status' });
  }
  await repository.setRunStatus(id, runId, status);
  return await repository.findById(id);
}

export async function setRunsStatusByStatus(id, fromStatus, toStatus, userId, userOrg, userRole, userPermissions) {
  await getById(id, userId, userOrg, userRole, userPermissions);
  await repository.setRunsStatusByStatus(id, fromStatus, toStatus);
  return await repository.findById(id);
}

export async function chooseRun(id, runId, userId, userOrg, userRole, userPermissions) {
  const queue = await getById(id, userId, userOrg, userRole, userPermissions);
  
  if (!hasPermission({ permissions: userPermissions }, 'queues', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const run = (queue.runs || []).find(item => item._id?.toString() === runId.toString());
  if (!run) {
    throw createError({ statusCode: 404, message: 'Run not found' });
  }
  if (run.status !== 'COMPLETE') {
    throw createError({ statusCode: 400, message: 'Run must be COMPLETE to choose' });
  }
  
  // Set chosen run in repository
  await repository.setChosenRun(id, runId);
  
  // Automatically mark queue as CUT when a run is chosen
  await repository.updateById(id, { status: 'CUT' });
  
  // Also record in cutLogs (triggering markCut logic)
  await markCut(id, userId, userOrg, userRole, userPermissions);
  
  return await repository.findById(id);
}

export async function removeRun(id, runId, userId, userOrg, userRole, userPermissions) {
  const queue = await getById(id, userId, userOrg, userRole, userPermissions);
  
  if (!hasPermission({ permissions: userPermissions }, 'queues', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const run = (queue.runs || []).find(item => item._id?.toString() === runId.toString());
  if (!run) {
    throw createError({ statusCode: 404, message: 'Run not found' });
  }
  
  if (run.status === 'NESTING') {
    throw createError({ statusCode: 400, message: 'Cannot delete run in progress' });
  }
  
  await repository.pullRun(id, runId);
  
  // If this was the chosen run, unset it
  if (queue.chosenRunId?.toString() === runId.toString()) {
    await repository.updateById(id, { chosenRunId: null });
  }
  
  // Also delete associated artifacts
  const { connectDB } = await import('../../db/mongo.js');
  const db = await connectDB();
  await db.collection('artifacts').deleteMany({
    queueId: new ObjectId(id),
    runId: new ObjectId(runId)
  });
  
  return await repository.findById(id);
}
