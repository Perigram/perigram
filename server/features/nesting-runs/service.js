import * as repository from './repository.js';
import { createError } from 'h3';
import { createStatus, inheritLineage, registerService } from '~/server/utils/blocks';
import { statusService } from '~/server/core/machines/service';
import { mapLineageQuery } from '~/server/utils/query';
import { ObjectId } from 'mongodb';
import { hasLineagePermission, getLineageFilter } from '~/server/utils/permissions';

/**
 * Nesting Runs Service - v24 Standardized
 */

registerService('nesting_run', {
  getById: (uid) => getById(uid)
});

export async function createFromQueue(queue, results, userId) {
  const lineage = inheritLineage(queue, 'queue');
  const origin = createStatus('PROPOSED', userId || 'SYSTEM', { note: 'Nesting calculation completed' });

  const runData = {
    identity: { uid: `run-${ObjectId().toString().substring(0, 8)}` },
    origin,
    status: origin,
    lineage,
    data: {
      results: {
        efficiency: results.efficiency || 0,
        sheetCount: results.sheetCount || 0,
        remnantArea: results.remnantArea || 0
      },
      layoutData: results.layoutData || {},
      artifactIds: []
    }
  };

  return await repository.create(runData);
}

export async function getById(uid) {
  const raw = await repository.findById(uid);
  if (!raw) return null;
  return raw;
}

export async function updateStatus(id, newState, userId, userRole, metadata = {}) {
  return await statusService.transition('nesting_run', id, newState, userId, userRole, metadata);
}

export async function list(userId, userOrg, userRole, userPermissions, filter = {}) {
  const lineageFilter = getLineageFilter({ memberships: userPermissions.memberships, role: userRole });
  const finalFilter = mapLineageQuery({ ...lineageFilter, ...filter });
  return await repository.find(finalFilter);
}

export async function getNextRunNumber(queueId) {
  const count = await repository.find({ 'lineage.queueId': queueId });
  return count.length + 1;
}

export async function chooseRun(queueId, runId, userId, userOrg, userRole, userPermissions) {
  const run = await repository.findById(runId);
  if (!run) throw createError({ statusCode: 404, message: 'Nesting run not found' });
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, run.lineage, 'queues', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const db = await (await import('~/server/db/mongo')).connectDB();
  
  // Reset other chosen runs
  await db.collection('nesting_runs').updateMany(
    { 'lineage.queueId': queueId, 'status.state': 'CHOSEN' },
    { $set: { 'status.state': 'COMPLETE' } }
  );

  await statusService.transition('nesting_run', runId, 'CHOSEN', userId, userRole, { note: 'Chosen for production' });

  return await repository.findById(runId);
}

export async function remove(queueId, runId, userId, userOrg, userRole, userPermissions) {
  const run = await repository.findById(runId);
  if (!run) throw createError({ statusCode: 404, message: 'Nesting run not found' });
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, run.lineage, 'queues', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  return await repository.deleteById(runId);
}
