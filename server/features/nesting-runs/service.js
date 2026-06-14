import * as repository from './repository.js';
import { createError } from 'h3';
import { 
  createStatus, 
  inheritLineage 
} from '../../core/blocks/index.js';
import { createTransitionAuth, statusService } from '../../core/machines/service.js';
import { aggregator } from '../../core/machines/aggregator.js';
import { ObjectId } from 'mongodb';
import { hasLineagePermission, getLineageFilter } from '../../utils/permissions.js';
import { toFlexibleId } from '../../utils/objectid.js';
import { NestingRun } from './model.js';
import * as queuesService from '../queues/service.js';

/**
 * Nesting Runs Service - v24 Standardized
 */


export async function create(runData, userId) {
  const run = new NestingRun(runData);
  const raw = await repository.create(run);
  
  // Trigger summary update on queue
  aggregator.syncParentSummary('nesting_run', run.lineage).catch(err => {
    console.error('[Nesting Run Service] Failed to sync parent summary:', err.message);
  });

  return new NestingRun(raw).toJSON();
}

export async function createFromQueue(queue, results, userId) {
  const lineage = inheritLineage(queue, 'queue');
  const origin = createStatus('COMPLETE', userId || 'SYSTEM', { note: 'Nesting calculation completed' });

  const runData = {
    identity: { uid: `run-${new ObjectId().toString().substring(0, 8)}` },
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

  const raw = await repository.create(runData);

  // Trigger summary update on queue
  aggregator.syncParentSummary('nesting_run', lineage).catch(err => {
    console.error('[Nesting Run Service] Failed to sync parent summary:', err.message);
  });

  return new NestingRun(raw).toJSON();
}

export async function getById(uid, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(uid);
  if (!raw) return null;
  const run = new NestingRun(raw);
  if (userPermissions?.memberships && !hasLineagePermission({ memberships: userPermissions.memberships }, run.lineage, 'queues', 'read')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  return run.toJSON();
}

export async function updateStatus(id, newState, userId, userRole, metadata = {}) {
  return await statusService.transition('nesting_run', id, newState, userId, createTransitionAuth(userId, userRole), metadata);
}

export async function list(userId, userOrg, userRole, userPermissions, filter = {}) {
  const lineageFilter = getLineageFilter({ memberships: userPermissions.memberships });
  
  // Explicitly map common IDs in filters to lineage block
  const processedFilter = { ...filter };
  if (processedFilter.queueId) {
    processedFilter['lineage.queueId'] = toFlexibleId(processedFilter.queueId);
    delete processedFilter.queueId;
  }
  if (processedFilter.projectId) {
    processedFilter['lineage.projectId'] = toFlexibleId(processedFilter.projectId);
    delete processedFilter.projectId;
  }

  const finalFilter = { ...lineageFilter, ...processedFilter };
  const raws = await repository.find(finalFilter);
  return raws.map(raw => new NestingRun(raw).toJSON());
}

export async function getNextRunNumber(queueId) {
  const raws = await repository.find({ 'lineage.queueId': toFlexibleId(queueId) });
  return raws.length + 1;
}

export async function chooseRun(queueId, runId, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(runId);
  if (!raw) throw createError({ statusCode: 404, message: 'Nesting run not found' });
  const run = new NestingRun(raw);
  if (run.lineage?.queueId?.toString() !== queueId?.toString()) {
    throw createError({ statusCode: 400, message: 'Nesting run does not belong to this queue' });
  }
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships }, run.lineage, 'queues', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  if (run.status?.state !== 'COMPLETE') {
    throw createError({ statusCode: 400, message: 'Only completed nesting runs can be chosen for production' });
  }

  await statusService.transition('nesting_run', runId, 'CHOSEN', userId, createTransitionAuth(userId, userRole, userPermissions), { note: 'Chosen for production' });

  const chosenRun = await getById(runId);
  const queue = await queuesService.getById(queueId, userId, userOrg, userRole, userPermissions);
  return { run: chosenRun, queue };
}

export async function remove(queueId, runId, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(runId);
  if (!raw) throw createError({ statusCode: 404, message: 'Nesting run not found' });
  const run = new NestingRun(raw);
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships }, run.lineage, 'queues', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  return await repository.deleteById(runId);
}

async function preflightChosenNestingRun({ entity, targetId, userId, userRole, auth }) {
  const run = new NestingRun(entity);
  const queueId = run.lineage?.queueId?.toString?.() || run.lineage?.queueId;

  if (!queueId) {
    throw createError({ statusCode: 400, message: 'Nesting run is missing queue lineage' });
  }

  if (run.status?.state !== 'COMPLETE') {
    throw createError({ statusCode: 400, message: 'Only completed nesting runs can be chosen for production' });
  }

  await queuesService.ensureReadyForCompletedRun(queueId, run.toJSON());
  await queuesService.preflightChosenRunProduction(
    queueId,
    run.toJSON(),
    userId,
    auth?.organizationId,
    userRole,
    auth
  );
}

async function applyChosenNestingRun({ targetId, userId, userRole, auth }) {
  const raw = await repository.findById(targetId);
  if (!raw) throw createError({ statusCode: 404, message: 'Nesting run not found' });

  const chosenRun = new NestingRun(raw).toJSON();
  const queueId = chosenRun.lineage?.queueId?.toString?.() || chosenRun.lineage?.queueId;
  if (!queueId) {
    throw createError({ statusCode: 400, message: 'Nesting run is missing queue lineage' });
  }

  const previousChosenRuns = await repository.findChosenRuns(queueId, targetId);
  for (const previousRun of previousChosenRuns) {
    await statusService.transition(
      'nesting_run',
      previousRun._id,
      'COMPLETE',
      userId,
      createTransitionAuth(userId, auth || userRole),
      { note: 'Another nesting run was chosen for production' }
    );
  }

  const queue = await queuesService.applyChosenRunProduction(
    queueId,
    chosenRun,
    userId,
    auth?.organizationId,
    userRole,
    auth
  );

  return {
    entities: [
      { type: 'nesting_run', id: chosenRun._id?.toString?.() || chosenRun._id, entity: chosenRun },
      { type: 'queue', id: queue._id?.toString?.() || queue._id, entity: queue }
    ]
  };
}

export const hooks = {
  preflightChosenNestingRun,
  applyChosenNestingRun
};
