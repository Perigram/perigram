import * as repository from './repository.js';
import { createError } from 'h3';
import { 
  createStatus, 
  inheritLineage 
} from '../../core/blocks/index.js';
import { statusService } from '../../core/machines/service.js';
import { aggregator } from '../../core/machines/aggregator.js';
import { ObjectId } from 'mongodb';
import { hasLineagePermission, getLineageFilter } from '../../utils/permissions.js';
import { toFlexibleId } from '../../utils/objectid.js';
import { NestingRun } from './model.js';

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

export async function getById(uid) {
  const raw = await repository.findById(uid);
  if (!raw) return null;
  return new NestingRun(raw).toJSON();
}

export async function updateStatus(id, newState, userId, userRole, metadata = {}) {
  return await statusService.transition('nesting_run', id, newState, userId, userRole, metadata);
}

export async function list(userId, userOrg, userRole, userPermissions, filter = {}) {
  const lineageFilter = getLineageFilter({ memberships: userPermissions.memberships, role: userRole });
  
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
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, run.lineage, 'queues', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  // Reset other chosen runs for this queue using repository
  await repository.resetChosenRuns(queueId);

  // Transition this run to CHOSEN
  await statusService.transition('nesting_run', runId, 'CHOSEN', userId, { userId, role: userRole, memberships: userPermissions.memberships }, { note: 'Chosen for production' });

  return await getById(runId);
}

export async function remove(queueId, runId, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(runId);
  if (!raw) throw createError({ statusCode: 404, message: 'Nesting run not found' });
  const run = new NestingRun(raw);
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, run.lineage, 'queues', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  return await repository.deleteById(runId);
}

/**
 * Side effect: When run is CHOSEN, prepare physical inventory
 */
export async function createPhysicalUnits({ targetId, userId, userRole, lineage }) {
  console.log(`[Nesting Run Service] Creating physical units for chosen run ${targetId}`);
  // Implementation will follow
}
