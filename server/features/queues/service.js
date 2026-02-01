import * as repository from './repository.js';
import * as projectsService from '../projects/service.js';
import { createError } from 'h3';
import { hasLineagePermission, getLineageFilter } from '~/server/utils/permissions';
import { inheritLineage, registerService } from '~/server/utils/blocks';
import { Queue } from './model.js';
import { statusService } from '~/server/core/machines/service';
import { generateRandomString } from '~/server/utils/strings';
import { ObjectId } from 'mongodb';
import { connectDB } from '~/server/db/mongo';

/**
 * Queues Service - v24 Absolute Final
 */

registerService('queue', {
  getById: (uid) => getById(uid)
});

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
    params: { job, queueNumber }
  });

  queue.applyStatus('DRAFT', userId, { note: 'Initial queue creation' });

  const createdRaw = await repository.create(queue);
  return new Queue(createdRaw);
}

export async function getById(uid) {
  const raw = await repository.findById(uid);
  if (!raw) return null;
  return new Queue(raw);
}

export async function listByProject(projectId, userId, userOrg, userRole, userPermissions) {
  const filter = {
    ...getLineageFilter({ memberships: userPermissions.memberships, role: userRole }),
    'lineage.projectId': projectId
  };
  const raws = await repository.find(filter);
  return raws.map(raw => new Queue(raw));
}

export async function update(uid, updates, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(uid);
  if (!raw) throw createError({ statusCode: 404, message: 'Queue not found' });
  const queue = new Queue(raw);
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, queue.lineage, 'queues', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  if (updates.status) {
    await statusService.transition('queue', queue._id, updates.status, userId, userRole, updates.statusMeta || {});
    return await getById(uid);
  }

  queue.data = { ...queue.data, ...(updates.data || {}) };

  await repository.updateById(uid, queue);
  const updatedRaw = await repository.findById(uid);
  return new Queue(updatedRaw);
}

export async function remove(uid, userId, userOrg, userRole, userPermissions) {
  const queue = await getById(uid);
  if (!queue) throw createError({ statusCode: 404, message: 'Queue not found' });
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, queue.lineage, 'queues', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  return await repository.deleteById(uid);
}

export async function markCut(queueId, userId, userOrg, userRole, userPermissions) {
  const queue = await getById(queueId);
  if (!queue) throw createError({ statusCode: 404, message: 'Queue not found' });
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, queue.lineage, 'queues', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const db = await connectDB();
  const chosenRun = await db.collection('nesting_runs').findOne({
    'lineage.queueId': queueId,
    'status.state': 'CHOSEN'
  });
  
  if (!chosenRun) throw createError({ statusCode: 400, message: 'No run chosen' });

  await statusService.transition('queue', queueId, 'CUT', userId, userRole, { note: 'Marked as CUT' });
  
  return await getById(queueId);
}

export async function resetToDraft(queueId, userId, userOrg, userRole, userPermissions) {
  const queue = await getById(queueId);
  if (!queue) throw createError({ statusCode: 404, message: 'Queue not found' });
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, queue.lineage, 'queues', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  await statusService.transition('queue', queueId, 'DRAFT', userId, userRole, { note: 'Reset to DRAFT' });
  
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
