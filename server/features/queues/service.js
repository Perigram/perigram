import * as repository from './repository.js';
import * as projectsService from '../projects/service.js';
import { createError } from 'h3';
import { hasLineagePermission, getLineageFilter } from '../../utils/permissions.js';
import { inheritLineage } from '~/server/core/blocks/index.js';
import { Queue } from './model.js';
import { statusService } from '../../core/machines/service.js';
import { aggregator } from '../../core/machines/aggregator.js';
import { generateRandomString } from '../../utils/strings.js';
import { ObjectId } from 'mongodb';
import { toFlexibleId } from '../../utils/objectid.js';

/**
 * Queues Service - v24 Absolute Final
 */


export async function create(data, userId, userOrg, userRole, userPermissions) {
  const { projectId, name, job } = data;
  
  if (!projectId) {
    throw createError({ statusCode: 400, message: 'Project ID is required' });
  }
  
  const project = await projectsService.getById(projectId);
  if (!project) throw createError({ statusCode: 404, message: 'Project not found' });

  const lineage = inheritLineage(project, 'project');

  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, lineage, 'queues', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const queueNumber = await repository.getNextQueueNumber(projectId);
  const uid = `q-${generateRandomString(8)}`;

  const queue = new Queue({
    identity: { uid, name: name || `Queue #${queueNumber}` },
    lineage,
    data: {
      job: job || { items: [], materialPool: [] },
      queueNumber
    }
  });

  queue.applyStatus('DRAFT', userId, { note: 'Initial queue creation' });

  const createdRaw = await repository.create(queue);

  // Trigger summary update on project
  aggregator.syncParentSummary('queue', lineage).catch(err => {
    console.error('[Queues Service] Failed to sync parent summary:', err.message);
  });

  return new Queue(createdRaw).toJSON();
}

export async function getById(uid) {
  const raw = await repository.findById(uid);
  if (!raw) return null;
  return new Queue(raw).toJSON();
}

export async function listByProject(projectId, userId, userOrg, userRole, userPermissions) {
  const filter = {
    ...getLineageFilter({ memberships: userPermissions.memberships, role: userRole }),
    'lineage.projectId': toFlexibleId(projectId)
  };
  const raws = await repository.find(filter);
  return raws.map(raw => new Queue(raw).toJSON());
}

export async function update(uid, updates, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(uid);
  if (!raw) throw createError({ statusCode: 404, message: 'Queue not found' });
  const queue = new Queue(raw);
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, queue.lineage, 'queues', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  if (updates.status) {
    await statusService.transition('queue', queue._id, updates.status, userId, { userId, role: userRole, memberships: userPermissions.memberships }, updates.statusMeta || {});
    return await getById(uid);
  }

  // Update data block
  queue.data = { ...queue.data, ...(updates.data || {}) };
  
  // Handle root level updates that should go to job/params
  if (updates.job) queue.data.job = updates.job;
  if (updates.nestingParams) queue.data.nestingParams = updates.nestingParams;

  await repository.updateById(uid, queue);
  const updatedRaw = await repository.findById(uid);
  return new Queue(updatedRaw).toJSON();
}

export async function remove(uid, userId, userOrg, userRole, userPermissions) {
  const queue = await repository.findById(uid);
  if (!queue) throw createError({ statusCode: 404, message: 'Queue not found' });
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, queue.lineage, 'queues', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  return await repository.deleteById(uid);
}

export async function markCut(queueId, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(queueId);
  if (!raw) throw createError({ statusCode: 404, message: 'Queue not found' });
  const queue = new Queue(raw);
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, queue.lineage, 'queues', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const chosenRun = await repository.findChosenNestingRun(queueId);
  
  if (!chosenRun) throw createError({ statusCode: 400, message: 'No run chosen' });

  await statusService.transition('queue', queueId, 'CUT', userId, { userId, role: userRole, memberships: userPermissions.memberships }, { note: 'Marked as CUT' });
  
  return await getById(queueId);
}

export async function resetToDraft(queueId, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(queueId);
  if (!raw) throw createError({ statusCode: 404, message: 'Queue not found' });
  const queue = new Queue(raw);
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, queue.lineage, 'queues', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  await statusService.transition('queue', queueId, 'DRAFT', userId, { userId, role: userRole, memberships: userPermissions.memberships }, { note: 'Reset to DRAFT' });
  
  return await getById(queueId);
}

export async function getArtifacts(queueId, userId, userOrg, userRole, userPermissions, runId) {
    const queue = await getById(queueId);
    if (!queue) throw createError({ statusCode: 404, message: 'Queue not found' });
    
    if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, queue.lineage, 'queues', 'read')) {
        throw createError({ statusCode: 403, message: 'Permission denied' });
    }

    const { list: listArtifacts } = await import('../artifacts/service.js');
    const filter = { 'lineage.queueId': queueId };
    if (runId) filter['lineage.runId'] = runId;

    return await listArtifacts(filter);
}

/**
 * Side effect: When queue is CUT, transition physical units
 */
export async function processPhysicalCut({ targetId, userId, userRole, lineage }) {
  console.log(`[Queue Service] Processing physical cut for queue ${targetId}`);
  // Implementation will follow in next turn
}
