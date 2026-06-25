import * as repository from './repository.js';
import { createError } from 'h3';
import { getPrimaryState, inheritLineage } from '../../core/blocks/index.js';
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
  const initialStatus = runData.status || statusService.initialStatus('nesting_run', userId || 'SYSTEM', {
    note: 'Nesting run initialized'
  });
  const run = new NestingRun(runData);
  run.origin = run.origin || initialStatus;
  run.status = run.status || initialStatus;
  const raw = await repository.create(run);
  
  // Trigger summary update on queue
  aggregator.syncParentSummary('nesting_run', run.lineage).catch(err => {
    console.error('[Nesting Run Service] Failed to sync parent summary:', err.message);
  });

  return new NestingRun(raw).toJSON();
}

export async function createFromQueue(queue, results, userId) {
  const lineage = inheritLineage(queue, 'queue');
  const origin = statusService.initialStatus('nesting_run', userId || 'SYSTEM', { note: 'Nesting run initialized' });

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
  await statusService.applyIntent(
    'nesting_run',
    raw._id,
    'nestingSolveCompleted',
    createTransitionAuth(userId || 'SYSTEM', 'SYSTEM'),
    { note: 'Nesting calculation completed' }
  );
  const completed = await repository.findById(raw._id);

  // Trigger summary update on queue
  aggregator.syncParentSummary('nesting_run', lineage).catch(err => {
    console.error('[Nesting Run Service] Failed to sync parent summary:', err.message);
  });

  return new NestingRun(completed || raw).toJSON();
}

export async function getById(uid, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(uid);
  if (!raw) return null;
  const run = new NestingRun(raw);
  if (userPermissions?.memberships && !hasLineagePermission(userPermissions, run, 'nesting_runs', 'read')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  return run.toJSON();
}

export async function updateStatus(id, newState, userId, userRole, metadata = {}) {
  return await statusService.transition('nesting_run', id, newState, userId, createTransitionAuth(userId, userRole), metadata);
}

export async function list(userId, userOrg, userRole, userPermissions, filter = {}) {
  const lineageFilter = getLineageFilter(userPermissions);
  
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
  return raws
    .map(raw => new NestingRun(raw))
    .filter(run => hasLineagePermission(userPermissions, run, 'nesting_runs', 'read'))
    .map(run => run.toJSON());
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
  
  if (!hasLineagePermission(userPermissions, run, 'nesting_runs', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  if (getPrimaryState(run.status) !== 'COMPLETE') {
    throw createError({ statusCode: 400, message: 'Only completed nesting runs can be chosen for production' });
  }

  await statusService.applyIntent(
    'nesting_run',
    runId,
    'acceptNestingRun',
    createTransitionAuth(userId, userRole, userPermissions),
    { note: 'Chosen for production' }
  );

  const chosenRun = await getById(runId);
  const queue = await queuesService.getById(queueId, userId, userOrg, userRole, userPermissions);
  return { run: chosenRun, queue };
}

export async function remove(queueId, runId, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(runId);
  if (!raw) throw createError({ statusCode: 404, message: 'Nesting run not found' });
  const run = new NestingRun(raw);
  
  if (!hasLineagePermission(userPermissions, run, 'nesting_runs', 'admin', { action: 'delete' })) {
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

  if (getPrimaryState(run.status) !== 'COMPLETE') {
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

  return {
    entities: [{ type: 'nesting_run', id: chosenRun._id?.toString?.() || chosenRun._id, entity: chosenRun }],
    effects: [
      ...(await repository.findChosenRuns(queueId, targetId)).map(previousRun => ({
        type: 'transition',
        entity: { type: 'nesting_run', id: previousRun._id?.toString?.() || previousRun._id },
        targetState: 'COMPLETE',
        metadata: { note: 'Another nesting run was chosen for production' }
      })),
      {
        type: 'updateEntity',
        entity: { type: 'queue', id: queueId },
        operation: 'applyChosenRunProduction',
        args: [chosenRun],
        input: chosenRun
      }
    ]
  };
}

export const hooks = {
  preflightChosenNestingRun,
  applyChosenNestingRun
};
