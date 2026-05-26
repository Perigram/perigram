import { createError } from 'h3';
import { randomUUID } from 'node:crypto';
import { createTaskResult } from '../blocks/index.js';
import { getAppRegistry } from '../../runtime/app-registry.js';
import * as repository from './repository.js';

const TERMINAL_STATUSES = ['SUCCEEDED', 'FAILED', 'CANCELLED'];

export async function enqueueTask(taskId, input = {}, auth = {}, options = {}) {
  const task = getTaskDefinition(taskId);
  if (!task) throw createError({ statusCode: 400, message: `Unknown task: ${taskId}` });
  const normalizedInput = normalizeTaskInput(task, input);
  const existing = await repository.findByIdempotencyKey(taskId, options.idempotencyKey);
  if (existing && !TERMINAL_STATUSES.includes(existing.status)) return existing;

  return await repository.create({
    taskId,
    domainId: options.domainId || 'cnc',
    service: task.service,
    executor: task.executor || null,
    workerType: task.executor?.workerType || task.executor?.target || null,
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

export const createTaskRun = enqueueTask;

export async function claimTask({ taskId = null, workerType = null, workerId = 'worker', leaseMs = 60000 } = {}) {
  if (taskId && !getTaskDefinition(taskId)) throw createError({ statusCode: 400, message: `Unknown task: ${taskId}` });
  const now = new Date();
  const claimToken = randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + Number(leaseMs || 60000));
  return await repository.claimNext({ taskId, workerType, workerId, claimToken, leaseExpiresAt, now });
}

export const claimNextTaskRun = (taskId, workerId) => claimTask({ taskId, workerId });

export async function dispatchRegisteredTaskExecutors({ workerId = 'app-task-executor', limit = 5, leaseMs = 3600000 } = {}) {
  const registry = getAppRegistry();
  const dispatched = [];
  for (const task of registry.listTaskDefinitions()) {
    const executor = registry.getTaskExecutor(task.id);
    if (!executor) continue;

    let claimed = 0;
    while (claimed < limit) {
      const run = await claimTask({
        taskId: task.id,
        workerType: task.executor?.workerType || task.executor?.target || null,
        workerId,
        leaseMs
      });
      if (!run) break;
      claimed += 1;
      dispatched.push(await runClaimedTaskRun(run, executor, task));
    }
  }
  return dispatched;
}

export async function runClaimedTaskRun(run, executor, task = getTaskDefinition(run.taskId)) {
  try {
    const result = await executor({
      task,
      run,
      input: run.input || {},
      auth: run.auth || {}
    });
    return await completeTaskRun(run._id, result || {}, run.claimToken);
  } catch (error) {
    return await failTaskRun(run._id, error, run.claimToken);
  }
}

export async function heartbeatTaskRun(id, claimToken, { leaseMs = 60000 } = {}) {
  const run = await repository.findById(id);
  if (!run) throw createError({ statusCode: 404, message: 'Task run not found' });
  requireClaim(run, claimToken);
  return await repository.updateClaimedById(id, claimToken, {
    status: 'RUNNING',
    leaseExpiresAt: new Date(Date.now() + Number(leaseMs || 60000)),
    heartbeatAt: new Date()
  });
}

export async function completeTaskRun(id, result = {}, claimToken = null) {
  const run = await repository.findById(id);
  if (!run) throw createError({ statusCode: 404, message: 'Task run not found' });
  requireClaim(run, claimToken);
  const task = getTaskDefinition(run.taskId);
  const output = createTaskResult({ taskId: run.taskId, ...result });
  return await repository.updateClaimedById(id, claimToken, {
    status: task?.status?.succeeded || 'SUCCEEDED',
    output,
    finishedAt: new Date()
  });
}

export async function failTaskRun(id, error, claimToken = null) {
  const run = await repository.findById(id);
  if (!run) throw createError({ statusCode: 404, message: 'Task run not found' });
  requireClaim(run, claimToken);
  const task = getTaskDefinition(run.taskId);
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
    });
  }
  return await repository.updateClaimedById(id, claimToken, {
    status: task?.status?.failed || 'FAILED',
    error: { message: error?.message || String(error) },
    finishedAt: new Date()
  });
}

export async function cancelTaskRun(id, reason = 'Cancelled') {
  const run = await repository.findById(id);
  if (!run) throw createError({ statusCode: 404, message: 'Task run not found' });
  if (TERMINAL_STATUSES.includes(run.status)) return run;
  return await repository.updateById(id, {
    status: 'CANCELLED',
    error: { message: reason },
    finishedAt: new Date()
  });
}

export async function retryTaskRun(id) {
  const run = await repository.findById(id);
  if (!run) throw createError({ statusCode: 404, message: 'Task run not found' });
  if (!['FAILED', 'RETRY_WAIT'].includes(run.status)) throw createError({ statusCode: 409, message: `Cannot retry task run in ${run.status}` });
  return await repository.updateById(id, {
    status: 'QUEUED',
    runAfter: new Date(),
    claimToken: null,
    workerId: null,
    leaseExpiresAt: null,
    finishedAt: null
  });
}

export async function listTaskRuns(filter = {}) {
  return await repository.list(filter);
}

export function getTaskDefinition(taskId) {
  return getAppRegistry().getTaskDefinition(taskId);
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

function requireClaim(run, claimToken) {
  if (!run.claimToken) throw createError({ statusCode: 409, message: 'Task run is not claimed' });
  if (!claimToken) throw createError({ statusCode: 409, message: 'Task run claim token required' });
  if (run.claimToken !== claimToken) throw createError({ statusCode: 409, message: 'Task run claim token mismatch' });
}

function sanitizeAuth(auth = {}) {
  return {
    userId: auth.userId,
    organizationId: auth.organizationId,
    role: auth.role
  };
}
