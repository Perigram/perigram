import * as repository from './repository.js';
import { ObjectId } from 'mongodb';
import { createError } from 'h3';
import { hasLineagePermission, getLineageFilter } from '~/server/utils/permissions';
import { createIdentity, createStatus, inheritLineage } from '~/server/utils/blocks';
import { statusService } from '~/server/core/machines/service';
import * as projectsRepository from '../projects/repository.js';

function toDTO(queue) {
  if (!queue) return null;
  return {
    ...queue,
    name: queue.identity?.name || queue.name,
    queueNumber: queue.identity?.queueNumber || queue.queueNumber
  };
}

export async function getById(id, userId, userOrg, userRole, userPermissions) {
  if (!ObjectId.isValid(id)) {
    throw createError({ statusCode: 400, message: 'Invalid ID format' });
  }
  
  const queue = await repository.findById(id);
  if (!queue) {
    throw createError({ statusCode: 404, message: 'Queue not found' });
  }
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, queue.lineage, 'queues', 'read')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  return toDTO(queue);
}

export async function listByProject(projectId, userId, userOrg, userRole, userPermissions, options = {}) {
  const filter = {
    ...getLineageFilter({ memberships: userPermissions.memberships, role: userRole }),
    'lineage.projectId': new ObjectId(projectId)
  };
  const queues = await repository.find(filter, options);
  return queues.map(toDTO);
}

export async function create(data, userId, userOrg, userRole, userPermissions) {
  const { projectId, name, job } = data;
  
  if (!projectId || !ObjectId.isValid(projectId)) {
    throw createError({ statusCode: 400, message: 'Valid Project ID is required' });
  }
  
  const project = await projectsRepository.findById(projectId);
  if (!project) {
    throw createError({ statusCode: 404, message: 'Project not found' });
  }

  // 1. Lineage Inheritance
  const lineage = inheritLineage(project, 'project');

  // 2. Permission Check
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, lineage, 'queues', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const queueNumber = await repository.getNextQueueNumber(projectId);
  const origin = createStatus('DRAFT', userId, { note: 'Initial queue creation' });

  const queueData = {
    identity: {
      ...createIdentity(name || `Queue #${queueNumber}`),
      queueNumber
    },
    origin,
    status: origin,
    lineage,
    job: {
      items: (job?.items || []).map(item => ({
        type: item.type || 'PARAMETRIC',
        id: new ObjectId(item.id),
        quantity: item.quantity || 1,
        parameters: item.parameters || {}
      })),
      materialPool: (job?.materialPool || []).map(pool => ({
        type: pool.type,
        id: pool.id ? new ObjectId(pool.id) : null,
        specs: pool.specs || {}
      }))
    }
  };

  const queue = await repository.create(queueData);
  return toDTO(queue);
}

export async function update(id, updates, userId, userOrg, userRole, userPermissions) {
  const queue = await repository.findById(id); // Fetch raw for permission check
  if (!queue) throw createError({ statusCode: 404, message: 'Queue not found' });
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, queue.lineage, 'queues', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  // Status updates must go through statusService
  if (updates.status) {
    await statusService.transition('queue', queue._id, updates.status, userId, userRole, updates.statusMeta || {});
    delete updates.status;
  }

  const { identity, origin, status, lineage, ...clean } = updates;
  
  // Identity updates
  if (updates.name) {
    queue.identity.name = updates.name;
  }

  await repository.updateById(id, { identity: queue.identity, ...clean });
  const updated = await repository.findById(id);
  return toDTO(updated);
}

export async function remove(id, userId, userOrg, userRole, userPermissions) {
  const queue = await getById(id, userId, userOrg, userRole, userPermissions);
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, queue.lineage, 'queues', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  await repository.deleteById(id);
  return { success: true };
}

export async function addRun(queueId, runData, userId, userOrg, userRole, userPermissions) {
  const queue = await getById(queueId, userId, userOrg, userRole, userPermissions);
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, queue.lineage, 'queues', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  // Use repository to add run - native update needed as repository might not have push
  const db = await (await import('~/server/db/mongo')).connectDB();
  await db.collection('queues').updateOne(
    { _id: new ObjectId(queueId) },
    { $push: { runs: runData } }
  );
  
  const updated = await repository.findById(queueId);
  return toDTO(updated);
}

export async function setRunsStatusByStatus(queueId, fromStatus, toStatus, userId, userOrg, userRole, userPermissions) {
  const queue = await getById(queueId, userId, userOrg, userRole, userPermissions);
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, queue.lineage, 'queues', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const db = await (await import('~/server/db/mongo')).connectDB();
  await db.collection('queues').updateMany(
    { _id: new ObjectId(queueId), "runs.status": fromStatus },
    { $set: { "runs.$.status": toStatus } }
  );
}

export async function chooseRun(queueId, runId, userId, userOrg, userRole, userPermissions) {
  const queue = await getById(queueId, userId, userOrg, userRole, userPermissions);
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, queue.lineage, 'queues', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const run = (queue.runs || []).find(r => r._id.toString() === runId.toString());
  if (!run) throw createError({ statusCode: 404, message: 'Run not found' });
  
  const db = await (await import('~/server/db/mongo')).connectDB();
  
  // Set all runs to COMPLETE
  await db.collection('queues').updateOne(
      { _id: new ObjectId(queueId), "runs.status": "CHOSEN" },
      { $set: { "runs.$.status": "COMPLETE" } }
  );
  
  // Set chosen run to CHOSEN and update queue field
  await db.collection('queues').updateOne(
      { _id: new ObjectId(queueId), "runs._id": new ObjectId(runId) },
      { 
          $set: { 
              "runs.$.status": "CHOSEN",
              chosenRunId: new ObjectId(runId)
          } 
      }
  );

  const updated = await repository.findById(queueId);
  return toDTO(updated);
}

export async function markCut(queueId, userId, userOrg, userRole, userPermissions) {
  const queue = await getById(queueId, userId, userOrg, userRole, userPermissions);
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, queue.lineage, 'queues', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  if (!queue.chosenRunId) {
      throw createError({ statusCode: 400, message: 'No run chosen' });
  }

  await statusService.transition('queue', queue._id, 'CUT', userId, userRole, { note: 'Marked as CUT' });
  
  const updated = await repository.findById(queueId);
  return toDTO(updated);
}

export async function resetToDraft(queueId, userId, userOrg, userRole, userPermissions) {
  const queue = await getById(queueId, userId, userOrg, userRole, userPermissions);
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, queue.lineage, 'queues', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  await statusService.transition('queue', queue._id, 'DRAFT', userId, userRole, { note: 'Reset to DRAFT' });
  
  const updated = await repository.findById(queueId);
  return toDTO(updated);
}

export async function removeRun(queueId, runId, userId, userOrg, userRole, userPermissions) {
  const queue = await getById(queueId, userId, userOrg, userRole, userPermissions);
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, queue.lineage, 'queues', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  const db = await (await import('~/server/db/mongo')).connectDB();
  await db.collection('queues').updateOne(
    { _id: new ObjectId(queueId) },
    { $pull: { runs: { _id: new ObjectId(runId) } } }
  );
  
  const updated = await repository.findById(queueId);
  return toDTO(updated);
}

export async function getArtifacts(queueId, userId, userOrg, userRole, userPermissions, runId) {
    const queue = await getById(queueId, userId, userOrg, userRole, userPermissions);
    
    // Check permission (already checked in getById but explicitly here)
    if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, queue.lineage, 'queues', 'read')) {
        throw createError({ statusCode: 403, message: 'Permission denied' });
    }

    const { service: artifactService } = await import('~/server/features/artifacts');
    
    const filter = { 
        'lineage.queueId': new ObjectId(queueId) 
    };
    if (runId) {
        filter['lineage.runId'] = new ObjectId(runId);
    }

    return await artifactService.list(filter);
}
