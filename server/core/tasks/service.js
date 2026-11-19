import { createError } from 'h3';
import { randomUUID } from 'node:crypto';
import { createTaskResult, normalizeEntityOutputContracts, validateResultEntityOutputs } from '../blocks/index.js';
import * as repository from './repository.js';
import { processEffects, processEvents, mergeProcessedEffects } from '../effects/service.js';
import { getAppRegistry } from '../../runtime/app-registry.js';

const TERMINAL_STATUSES = ['SUCCEEDED', 'FAILED', 'CANCELLED'];

function terminalStatuses(task) {
  const status = task?.status || {};
  return [
    status.succeeded || TERMINAL_STATUSES[0],
    status.failed || TERMINAL_STATUSES[1],
    status.cancelled || TERMINAL_STATUSES[2]
  ];
}

function isTerminalStatus(task, status) {
  return terminalStatuses(task).includes(status);
}

export async function enqueueTask(taskId, input = {}, auth = {}, options = {}) {
  // Runtime-declared contracts (plugin connectors) pass their definition;
  // static registry tasks resolve as before.
  const task = options.definition || getTaskDefinition(taskId);
  if (!task) throw createError({ statusCode: 400, message: `Unknown task: ${taskId}` });
  const normalizedInput = normalizeTaskInput(task, input);
  const existing = await repository.findByIdempotencyKey(taskId, options.idempotencyKey);
  if (existing && !isTerminalStatus(task, existing.status)) return existing;

  return await repository.create({
    taskId,
    service: task.service,
    executor: task.executor || null,
    workerType: options.workerType || task.executor?.workerType || task.executor?.target || null,
    status: task.status?.queued || 'QUEUED',
    input: normalizedInput,
    auth: sanitizeAuth(auth),
    priority: options.priority || 0,
    maxAttempts: options.maxAttempts || task.retry?.maxAttempts || 3,
    idempotencyKey: options.idempotencyKey || null,
    parentRunId: options.parentRunId || null,
    runAfter: options.runAfter || new Date()
  });
}


export async function claimTask({ taskId = null, workerType = null, workerId = 'worker', leaseMs = 60000 } = {}) {
  const definition = taskId ? getTaskDefinition(taskId) : null;
  if (taskId && !definition) throw createError({ statusCode: 400, message: `Unknown task: ${taskId}` });
  const now = new Date();
  const claimToken = randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + Number(leaseMs || 60000));
  const claimable = definition ? claimableStatusesFor(definition) : claimableStatusesForDefinitions();
  const running = definition?.status?.running || 'RUNNING';
  return await repository.claimNext({
    taskId,
    workerType,
    workerId,
    claimToken,
    leaseExpiresAt,
    now,
    claimableStatuses: claimable,
    runningStatuses: definition ? [running] : runningStatusesForDefinitions(),
    runningStatus: definition ? running : runningStatusesByTaskId()
  });
}

export async function heartbeatTaskRun(id, claimToken, { leaseMs = 60000, workerType = null } = {}) {
  const run = await repository.findById(id);
  if (!run) throw createError({ statusCode: 404, message: 'Task run not found' });
  assertWorkerRunScope(run, workerType);
  const task = await resolveTaskDefinitionFor(run);
  requireClaim(run, claimToken);
  return await repository.updateClaimedById(id, claimToken, {
    status: task?.status?.running || 'RUNNING',
    leaseExpiresAt: new Date(Date.now() + Number(leaseMs || 60000)),
    heartbeatAt: new Date()
  }, task?.status?.running || 'RUNNING');
}

export async function completeTaskRun(id, result = {}, claimToken = null, { workerType = null } = {}) {
  const run = await repository.findById(id);
  if (!run) throw createError({ statusCode: 404, message: 'Task run not found' });
  assertWorkerRunScope(run, workerType);
  const task = await resolveTaskDefinitionFor(run);
  if (isTerminalStatus(task, run.status)) return run;
  requireClaim(run, claimToken);
  requireRunning(run, task);
  // Connector task completions are opaque plugin values. Their worker
  // must not be able to turn JSON keys into platform-owned effects/events.
  const connectorTask = String(task?.service || '').startsWith('plugin.')
    || String(run.workerType || '').startsWith('plugin.');
  const output = createTaskResult(connectorTask
    ? { taskId: run.taskId, data: result?.data ?? result, raw: result }
    : { taskId: run.taskId, ...result, raw: result });
  const effectContext = {
    auth: run.auth || {},
    task,
    run,
    registry: getAppRegistry()
  };
  const processedEvents = connectorTask
    ? { events: [], entities: [], tasks: [], transitions: [], attachments: [] }
    : await processEvents(output.events || [], effectContext);
  const processedEffects = connectorTask
    ? { entities: [], tasks: [], transitions: [], events: [], attachments: [] }
    : await processEffects(output.effects || [], effectContext);
  output.events = processedEvents.events;
  output.effects = mergeProcessedEffects(processedEvents, processedEffects);

  const outputViolations = validateResultEntityOutputs({
    contracts: normalizeEntityOutputContracts(task?.output),
    entities: [
      ...output.entities || [],
      ...(output.effects?.entities || [])
    ],
    phase: 'completion'
  });
  if (outputViolations.length) {
    throw createError({ statusCode: 500, message: `Task ${run.taskId} result violates its declared output contract: ${outputViolations.join('; ')}` });
  }

  const updated = await repository.updateClaimedById(id, claimToken, {
    status: task?.status?.succeeded || 'SUCCEEDED',
    output,
    finishedAt: new Date()
  }, task?.status?.running || 'RUNNING');
  await notifyProcessTaskOutcome({ taskRunId: String(id), status: 'SUCCEEDED', output });
  return updated;
}

export async function failTaskRun(id, error, claimToken = null, { workerType = null } = {}) {
  const run = await repository.findById(id);
  if (!run) throw createError({ statusCode: 404, message: 'Task run not found' });
  assertWorkerRunScope(run, workerType);
  const task = await resolveTaskDefinitionFor(run);
  if (isTerminalStatus(task, run.status)) return run;
  requireClaim(run, claimToken);
  requireRunning(run, task);
  const retryable = !error?.statusCode || error.statusCode >= 500;
  const shouldRetry = retryable && (run.attempts || 0) < (run.maxAttempts || task?.retry?.maxAttempts || 3);
  if (shouldRetry) {
    return await repository.updateClaimedById(id, claimToken, {
      status: task?.status?.retryWait || 'RETRY_WAIT',
      error: { message: error?.message || String(error) },
      runAfter: new Date(Date.now() + Number(task?.retry?.backoffMs || 30000)),
      claimToken: null,
      workerId: null,
      leaseExpiresAt: null
    }, task?.status?.running || 'RUNNING');
  }
  const processedEvents = await processEvents(error?.events || [], {
    auth: run.auth || {},
    task,
    run,
    registry: getAppRegistry()
  });
  const processedEffects = await processEffects(error?.effects || [], {
    auth: run.auth || {},
    task,
    run,
    registry: getAppRegistry()
  });
  const updated = await repository.updateClaimedById(id, claimToken, {
    status: task?.status?.failed || 'FAILED',
    error: { message: error?.message || String(error) },
    output: {
      ok: false,
      taskId: run.taskId,
      events: processedEvents.events,
      effects: mergeProcessedEffects(processedEvents, processedEffects),
      error: { message: error?.message || String(error) }
    },
    finishedAt: new Date()
  }, task?.status?.running || 'RUNNING');
  await notifyProcessTaskOutcome({ taskRunId: String(id), status: 'FAILED', error: updated.error || error });
  return updated;
}

export async function cancelTaskRun(id, reason = 'Cancelled', { workerType = null } = {}) {
  const run = await repository.findById(id);
  if (!run) throw createError({ statusCode: 404, message: 'Task run not found' });
  assertWorkerRunScope(run, workerType);
  const task = await resolveTaskDefinitionFor(run);
  if (isTerminalStatus(task, run.status)) return run;
  const updated = await repository.updateById(id, {
    status: task?.status?.cancelled || 'CANCELLED',
    error: { message: reason },
    finishedAt: new Date()
  });
  await notifyProcessTaskOutcome({ taskRunId: String(id), status: 'CANCELLED', error: updated.error });
  return updated;
}

export async function retryTaskRun(id) {
  const run = await repository.findById(id);
  if (!run) throw createError({ statusCode: 404, message: 'Task run not found' });
  const task = await resolveTaskDefinitionFor(run);
  const retryable = [terminalStatuses(task)[1], task?.status?.retryWait || 'RETRY_WAIT'];
  if (!retryable.includes(run.status)) throw createError({ statusCode: 409, message: `Cannot retry task run in ${run.status}` });
  return await repository.updateById(id, {
    status: task?.status?.queued || 'QUEUED',
    runAfter: new Date(),
    claimToken: null,
    workerId: null,
    leaseExpiresAt: null,
    finishedAt: null
  });
}

export async function getTaskRunById(id) {
  return await repository.findById(id);
}

// Host capability evidence journal: the claim-bound capability route appends
// one record per capability the host itself executed for a running task, so
// graph execution evidence rests on host records rather than worker claims.
export async function appendTaskRunCapabilityEvidence(id, claimToken, record) {
  return await repository.pushClaimedById(id, claimToken, 'hostCapabilityEvidence', record);
}

export async function listTaskRuns(filter = {}) {
  return await repository.list(filter);
}

export function getTaskDefinition(taskId) {
  return getAppRegistry().getTaskDefinition(taskId);
}

// Plugin connector tasks carry their contract in the install snapshot,
// not the static registry: resolve through the plugins feature when the
// registry misses (the organization rides the run's sanitized auth).
// Dynamic import keeps the module graph acyclic — the plugins service
// imports this runtime's enqueueTask.
async function resolveTaskDefinitionFor(run) {
  const task = getTaskDefinition(run.taskId);
  if (task) return task;
  const { taskDefinitionFor } = await import('../../features/plugins/service.js');
  return await taskDefinitionFor(run.taskId, run.auth?.organizationId);
}

export function listTaskDefinitions() {
  return getAppRegistry().listTaskDefinitions();
}

function normalizeTaskInput(task, input = {}) {
  const entities = input.entities || {};
  for (const entity of task.input?.entities || []) {
    if (entity.required && !entities[entity.name]) {
      throw createError({ statusCode: 400, message: `Task ${task.id} requires entity ${entity.name}` });
    }
  }
  const parameters = validateFields(task, input.parameters || {});
  return { entities, parameters };
}

function validateFields(task, parameters) {
  const result = {};
  for (const field of task.input?.parameters || []) {
    const value = parameters[field.name] ?? field.default;
    if (field.required && (value === undefined || value === null || value === '')) {
      throw createError({ statusCode: 400, message: `Task ${task.id} requires parameter ${field.name}` });
    }
    if (value === undefined || value === null || value === '') continue;
    result[field.name] = value;
  }
  return result;
}

async function notifyProcessTaskOutcome({ taskRunId, status, output = null, error = null }) {
  try {
    const processService = await import('../../features/process-definitions/service.js');
    if (status === 'SUCCEEDED') {
      await processService.continueActionFromTask({ taskRunId, taskResult: output || {} });
    } else {
      await processService.failActionFromTask({ taskRunId, error, cancelled: status === 'CANCELLED' });
    }
  } catch (error) {
    console.error(`[Task ${taskRunId}] Process action continuation failed:`, error.message);
  }
}


function assertWorkerRunScope(run, workerType) {
  if (workerType && run.workerType !== workerType) {
    throw createError({ statusCode: 403, message: 'Connector cannot access this task run' });
  }
}

function requireClaim(run, claimToken) {
  if (!run.claimToken) throw createError({ statusCode: 409, message: 'Task run is not claimed' });
  if (!claimToken) throw createError({ statusCode: 409, message: 'Task run claim token required' });
  if (run.claimToken !== claimToken) throw createError({ statusCode: 409, message: 'Task run claim token mismatch' });
}

function requireRunning(run, task) {
  const running = task?.status?.running || 'RUNNING';
  if (run.status !== running) throw createError({ statusCode: 409, message: `Task run is not running: ${run.status}` });
}

function claimableStatusesFor(task) {
  return [task?.status?.queued || 'QUEUED', task?.status?.retryWait || 'RETRY_WAIT'];
}

function claimableStatusesForDefinitions() {
  const statuses = new Set(claimableStatusesFor(null));
  for (const task of listTaskDefinitions()) {
    for (const status of claimableStatusesFor(task)) statuses.add(status);
  }
  return [...statuses];
}

function runningStatusesForDefinitions() {
  return [...new Set(['RUNNING', ...Object.values(runningStatusesByTaskId())])];
}

function runningStatusesByTaskId() {
  const statuses = {};
  for (const task of listTaskDefinitions()) {
    if (task?.status?.running) statuses[task.id] = task.status.running;
  }
  return statuses;
}

function sanitizeAuth(auth = {}) {
  return {
    userId: auth.userId,
    organizationId: auth.organizationId,
    role: auth.role
  };
}
