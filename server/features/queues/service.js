import * as repository from './repository.js';
import { ObjectId } from 'mongodb';
import { createError } from 'h3';
import { hasLineagePermission, getLineageFilter } from '~/server/utils/permissions';
import { createIdentity, createStatus, inheritLineage } from '~/server/utils/blocks';
import { statusService } from '~/server/core/machines/service';
import * as projectsRepository from '../projects/repository.js';

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
  
  return queue;
}

export async function listByProject(projectId, userId, userOrg, userRole, userPermissions, options = {}) {
  const filter = {
    ...getLineageFilter({ memberships: userPermissions.memberships, role: userRole }),
    'lineage.projectId': new ObjectId(projectId)
  };
  return await repository.find(filter, options);
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
  const origin = createStatus('PENDING', userId, { note: 'Initial queue creation' });

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

  // Update project summary (async)
  // await hooks.updateProjectSummary({ targetId: project._id, ... })

  return queue;
}

export async function update(id, updates, userId, userOrg, userRole, userPermissions) {
  const queue = await getById(id, userId, userOrg, userRole, userPermissions);
  
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
  return await repository.findById(id);
}

export async function remove(id, userId, userOrg, userRole, userPermissions) {
  const queue = await getById(id, userId, userOrg, userRole, userPermissions);
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, queue.lineage, 'queues', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  // Check if any active nesting runs exist...
  
  await repository.deleteById(id);
  return { success: true };
}
