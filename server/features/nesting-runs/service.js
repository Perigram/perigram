import * as repository from './repository.js';
import { createProcessUpdateHandler } from '../_template/process-update-handler.js';
import { createError } from 'h3';
import { inheritLineage } from '../../core/blocks/index.js';
import { createTransitionAuth, statusService } from '../../core/machines/service.js';
import { aggregator } from '../../core/machines/aggregator.js';
import { ObjectId } from 'mongodb';
import { hasLineagePermission, getLineageFilter } from '../../utils/permissions.js';
import { toFlexibleId } from '../../utils/objectid.js';
import { NestingRun } from './model.js';
import * as queuesService from '../queues/service.js';
import * as workflowOverridesService from '../workflow-overrides/service.js';
import { serializeForAccess } from '../../utils/entity-redaction.js';

/**
 * Nesting Runs Service - v24 Standardized
 */


export async function create(runData, userId) {
  const initialStatus = runData.status || await statusService.initialStatusForOrganization(
    'nesting_run',
    runData.lineage?.organizationId,
    userId || 'SYSTEM',
    { note: 'Nesting run initialized' }
  );
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
  const origin = await statusService.initialStatusForOrganization(
    'nesting_run',
    lineage.organizationId,
    userId || 'SYSTEM',
    { note: 'Nesting run initialized' }
  );

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
  const result = await statusService.transitionWithResult({
    entityType: 'nesting_run',
    targetId: id,
    targetState: newState,
    auth: createTransitionAuth(userId, userRole),
    context: metadata
  });
  return result.status;
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
  const primaryStatuses = normalizePrimaryStatuses(processedFilter.primaryStatuses);
  if (primaryStatuses.length) processedFilter['status.state.primary'] = { $in: primaryStatuses };
  else if (processedFilter.status || processedFilter.primaryStatus) {
    processedFilter['status.state.primary'] = processedFilter.status || processedFilter.primaryStatus;
  }
  delete processedFilter.primaryStatuses;
  delete processedFilter.primaryStatus;
  delete processedFilter.status;

  const finalFilter = { ...lineageFilter, ...processedFilter };
  const raws = await repository.find(finalFilter);
  return raws
    .map(raw => new NestingRun(raw))
    .filter(run => hasLineagePermission(userPermissions, run, 'nesting_runs', 'read'))
    .map(run => run.toJSON());
}

export async function listPreviewByQueues(queueIds = [], userId, userOrg, userRole, userPermissions, options = {}) {
  const ids = Array.from(new Set(queueIds.flatMap(id => flexibleLookupValues(id)).filter(Boolean)));
  if (!ids.length) return {};

  const limit = Math.max(Number(options.limit || 4), 1);
  const raws = await repository.find({
    ...getLineageFilter(userPermissions),
    'lineage.queueId': { $in: ids }
  });
  const previews = {};
  const runs = raws
    .map(raw => new NestingRun(raw).toJSON())
    .filter(run => hasLineagePermission(userPermissions, run, 'nesting_runs', 'read'))
    .sort(sortByStatusTimestampDesc);

  for (const run of runs) {
    const queueId = run.lineage?.queueId?.toString?.() || run.lineage?.queueId;
    if (!queueId) continue;
    previews[queueId] ||= [];
    if (previews[queueId].length >= limit) continue;
    previews[queueId].push(nestingRunPreview(run, userPermissions));
  }

  return previews;
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

  const chosenState = await primaryStateForIntent('nesting_run', auth?.organizationId, 'acceptNestingRun', 'to');
  const previousRuns = chosenState
    ? await repository.findRunsByPrimaryState(queueId, chosenState, targetId)
    : [];
  return {
    entities: [{ type: 'nesting_run', id: chosenRun._id?.toString?.() || chosenRun._id, entity: chosenRun }],
    effects: [
      ...previousRuns.map(previousRun => ({
        type: 'transition',
        entity: { type: 'nesting_run', id: previousRun._id?.toString?.() || previousRun._id },
        intent: 'supersedeChosenRun',
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

async function primaryStateForIntent(entityType, organizationId, intent, edge = 'to') {
  const workflow = await workflowOverridesService.resolveActiveWorkflow({ entityType, organizationId });
  const region = workflow?.regions?.[workflow.primaryRegion || 'main'];
  return region?.transitions?.find(transition => transition.intent === intent)?.[edge] || '';
}

export const hooks = {
  preflightChosenNestingRun,
  applyChosenNestingRun
};

function normalizePrimaryStatuses(value) {
  if (Array.isArray(value)) return value.flatMap(normalizePrimaryStatuses);
  if (typeof value !== 'string') return [];
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

function flexibleLookupValues(id) {
  if (id === null || id === undefined) return [];
  const stringId = id?.toString?.() || id;
  const flexibleId = toFlexibleId(id);
  return [flexibleId, stringId].filter((value, index, values) => (
    value !== null && value !== undefined && values.findIndex(item => item?.toString?.() === value?.toString?.()) === index
  ));
}

function sortByStatusTimestampDesc(left = {}, right = {}) {
  return statusTimestamp(right) - statusTimestamp(left);
}

function statusTimestamp(entity = {}) {
  const value = entity.status?.timestamp || entity.origin?.timestamp || entity.updatedAt || entity.createdAt;
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function nestingRunPreview(run = {}, userPermissions = null) {
  const preview = {
    _id: run._id?.toString?.() || run._id,
    entityType: 'nestingRun',
    identity: {
      ...(run.identity || {}),
      name: run.identity?.name || run.identity?.uid || `Run ${String(run._id || '').slice(-6)}`
    },
    origin: run.origin || null,
    status: run.status || null,
    lineage: run.lineage || {},
    data: {
      results: run.data?.results || {}
    },
    summary: {}
  };
  return serializeForAccess('nestingRun', preview, userPermissions);
}

export const processUpdate = createProcessUpdateHandler({
  entityType: 'nesting_run',
  repository,
  Model: NestingRun
});
