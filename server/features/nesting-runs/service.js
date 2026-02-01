import * as repository from './repository.js';
import { createError } from 'h3';
import { inheritLineage, registerService } from '~/server/utils/blocks';
import { statusService } from '~/server/core/machines/service';
import { NestingRun } from '../queues/model.js';
import { hasLineagePermission, getLineageFilter } from '~/server/utils/permissions';
import { generateRandomString } from '~/server/utils/strings';

/**
 * Nesting Runs Service - v24 Absolute Final
 */

registerService('run', {
  getById: (uid) => getById(uid)
});

export async function createFromQueue(queue, results, userId) {
  const lineage = inheritLineage(queue, 'queue');
  const uid = `run-${generateRandomString(8)}`;

  const run = new NestingRun({
    identity: { uid },
    lineage,
    params: { results, layoutData: results.layoutData }
  });

  run.applyStatus('PROPOSED', userId || 'SYSTEM', { note: 'Nesting calculation completed' });

  const createdRaw = await repository.create(run);
  return new NestingRun(createdRaw);
}

export async function getById(uid) {
  const raw = await repository.findById(uid);
  if (!raw) return null;
  return new NestingRun(raw);
}

export async function list(userId, userOrg, userRole, userPermissions, filter = {}) {
  const lineageFilter = getLineageFilter({ memberships: userPermissions.memberships, role: userRole });
  const raws = await repository.find({ ...lineageFilter, ...filter });
  return raws.map(raw => new NestingRun(raw));
}

export async function chooseRun(queueId, runId, userId, userOrg, userRole, userPermissions) {
  const run = await getById(runId);
  if (!run) throw createError({ statusCode: 404, message: 'Nesting run not found' });
  
  if (run.lineage?.queueId !== queueId) {
    throw createError({ statusCode: 400, message: 'Run does not belong to this queue' });
  }
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, run.lineage, 'queues', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  // Use statusService for state transition
  await statusService.transition('nesting_run', run._id, 'CHOSEN', userId, userRole, { note: 'Manually chosen' });
  
  return await getById(runId);
}

export async function remove(queueId, runId, userId, userOrg, userRole, userPermissions) {
  const run = await getById(runId);
  if (!run) throw createError({ statusCode: 404, message: 'Nesting run not found' });
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, run.lineage, 'queues', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  return await repository.deleteById(runId);
}