import * as repository from './repository.js';
import { createError } from 'h3';
import { createStatus, inheritLineage } from '~/server/utils/blocks';
import { statusService } from '~/server/core/machines/service';
import { mapLineageQuery } from '~/server/utils/query';
import { ObjectId } from 'mongodb';
import { hasLineagePermission, getLineageFilter } from '~/server/utils/permissions';

/**
 * Nesting Runs Service - v24 Standardized
 */

export async function createFromQueue(queue, results, userId) {
  // 1. Lineage Inheritance
  const lineage = inheritLineage(queue, 'queue');

  const origin = createStatus('PROPOSED', userId || 'SYSTEM', { note: 'Nesting calculation completed' });

  const runData = {
    origin,
    status: origin,
    lineage,
    results: {
      efficiency: results.efficiency || 0,
      sheetCount: results.sheetCount || 0,
      remnantArea: results.remnantArea || 0
    },
    layoutData: results.layoutData || {},
    artifactIds: []
  };

  return await repository.create(runData);
}

export async function getById(id, userId, userOrg, userRole, userPermissions) {
  const run = await repository.findById(id);
  if (!run) throw createError({ statusCode: 404, message: 'Nesting run not found' });
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, run.lineage, 'queues', 'read')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  return run;
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
  const count = await repository.count({ 'lineage.queueId': new ObjectId(queueId) });
  return count + 1;
}

export async function chooseRun(queueId, runId, userId, userOrg, userRole, userPermissions) {
  if (!ObjectId.isValid(runId)) throw createError({ statusCode: 400, message: 'Invalid runId' });
  const run = await repository.findById(runId);
  if (!run) throw createError({ statusCode: 404, message: 'Nesting run not found' });
  if (run.lineage?.queueId?.toString() !== queueId.toString()) {
    throw createError({ statusCode: 400, message: 'Run does not belong to this queue' });
  }
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, run.lineage, 'queues', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const db = await (await import('~/server/db/mongo')).connectDB();
  const completeStatus = createStatus('COMPLETE', userId, { note: 'De-selected as chosen run' });

  await db.collection('nesting_runs').updateMany(
    { 'lineage.queueId': new ObjectId(queueId), 'status.state': 'CHOSEN' },
    { $set: { status: completeStatus } }
  );

  const chosenStatus = createStatus('CHOSEN', userId, { note: 'Manually chosen for production' });
  await db.collection('nesting_runs').updateOne(
    { _id: new ObjectId(runId) },
    { $set: { status: chosenStatus } }
  );

  return await repository.findById(runId);
}

export async function remove(queueId, runId, userId, userOrg, userRole, userPermissions) {
  if (!ObjectId.isValid(runId)) throw createError({ statusCode: 400, message: 'Invalid runId' });
  const run = await repository.findById(runId);
  if (!run) throw createError({ statusCode: 404, message: 'Nesting run not found' });
  if (run.lineage?.queueId?.toString() !== queueId.toString()) {
    throw createError({ statusCode: 400, message: 'Run does not belong to this queue' });
  }
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, run.lineage, 'queues', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  await repository.deleteById(runId);
  return { success: true };
}
