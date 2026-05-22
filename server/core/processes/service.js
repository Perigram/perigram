import { createError } from 'h3';
import { randomUUID } from 'node:crypto';
import { createProcessResult } from '../blocks/index.js';
import { getCutkitRegistry } from '../../runtime/cutkit-registry.js';
import * as repository from './repository.js';

const TERMINAL_STATUSES = ['SUCCEEDED', 'FAILED', 'CANCELLED'];

export async function enqueueProcess(processId, input = {}, auth = {}, options = {}) {
  const process = getProcessDefinition(processId);
  if (!process) throw createError({ statusCode: 400, message: `Unknown process: ${processId}` });
  const normalizedInput = normalizeProcessInput(process, input);
  const existing = await repository.findByIdempotencyKey(processId, options.idempotencyKey);
  if (existing && !TERMINAL_STATUSES.includes(existing.status)) return existing;

  return await repository.create({
    processId,
    domainId: options.domainId || 'cnc',
    service: process.service,
    executor: process.executor || null,
    status: process.status?.queued || 'QUEUED',
    input: normalizedInput,
    auth: sanitizeAuth(auth),
    priority: options.priority || 0,
    maxAttempts: options.maxAttempts || process.retry?.maxAttempts || 3,
    idempotencyKey: options.idempotencyKey || null,
    parentRunId: options.parentRunId || null,
    runAfter: options.runAfter || new Date()
  });
}

export const createProcessRun = enqueueProcess;

export async function claimProcess({ processId = null, workerId = 'worker', leaseMs = 60000 } = {}) {
  if (processId && !getProcessDefinition(processId)) throw createError({ statusCode: 400, message: `Unknown process: ${processId}` });
  const now = new Date();
  const claimToken = randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + Number(leaseMs || 60000));
  return await repository.claimNext({ processId, workerId, claimToken, leaseExpiresAt, now });
}

export const claimNextProcessRun = (processId, workerId) => claimProcess({ processId, workerId });

export async function startProcessRun(id, workerId = 'SYSTEM') {
  const run = await repository.findById(id);
  if (!run) throw createError({ statusCode: 404, message: 'Process run not found' });
  if (TERMINAL_STATUSES.includes(run.status)) throw createError({ statusCode: 409, message: `Process run is already ${run.status}` });
  return await repository.startById(id, workerId);
}

export async function heartbeatProcessRun(id, claimToken, { leaseMs = 60000 } = {}) {
  const run = await repository.findById(id);
  if (!run) throw createError({ statusCode: 404, message: 'Process run not found' });
  if (run.claimToken && run.claimToken !== claimToken) throw createError({ statusCode: 409, message: 'Process run claim token mismatch' });
  const update = {
    status: 'RUNNING',
    leaseExpiresAt: new Date(Date.now() + Number(leaseMs || 60000)),
    heartbeatAt: new Date()
  };
  return run.claimToken
    ? await repository.updateClaimedById(id, claimToken, update)
    : await repository.updateById(id, update);
}

export async function completeProcessRun(id, result = {}, claimToken = null) {
  const run = await repository.findById(id);
  if (!run) throw createError({ statusCode: 404, message: 'Process run not found' });
  const process = getProcessDefinition(run.processId);
  if (run.claimToken && !claimToken) throw createError({ statusCode: 409, message: 'Process run claim token required' });
  if (run.claimToken && run.claimToken !== claimToken) throw createError({ statusCode: 409, message: 'Process run claim token mismatch' });
  const output = createProcessResult({ processId: run.processId, ...result });
  return await updateRun(id, claimToken, {
    status: process?.status?.succeeded || 'SUCCEEDED',
    output,
    finishedAt: new Date()
  });
}

export async function failProcessRun(id, error, claimToken = null) {
  const run = await repository.findById(id);
  if (!run) throw createError({ statusCode: 404, message: 'Process run not found' });
  const process = getProcessDefinition(run.processId);
  if (run.claimToken && !claimToken) throw createError({ statusCode: 409, message: 'Process run claim token required' });
  if (run.claimToken && run.claimToken !== claimToken) throw createError({ statusCode: 409, message: 'Process run claim token mismatch' });
  const shouldRetry = (run.attempts || 0) < (run.maxAttempts || process?.retry?.maxAttempts || 3);
  if (shouldRetry) {
    return await updateRun(id, claimToken, {
      status: process?.status?.retryWait || 'RETRY_WAIT',
      error: { message: error?.message || String(error) },
      runAfter: new Date(Date.now() + Number(process?.retry?.backoffMs || 30000)),
      claimToken: null,
      workerId: null,
      leaseExpiresAt: null
    });
  }
  return await updateRun(id, claimToken, {
    status: process?.status?.failed || 'FAILED',
    error: { message: error?.message || String(error) },
    finishedAt: new Date()
  });
}

export async function cancelProcessRun(id, reason = 'Cancelled') {
  const run = await repository.findById(id);
  if (!run) throw createError({ statusCode: 404, message: 'Process run not found' });
  if (TERMINAL_STATUSES.includes(run.status)) return run;
  return await repository.updateById(id, {
    status: 'CANCELLED',
    error: { message: reason },
    finishedAt: new Date()
  });
}

export async function retryProcessRun(id) {
  const run = await repository.findById(id);
  if (!run) throw createError({ statusCode: 404, message: 'Process run not found' });
  if (!['FAILED', 'RETRY_WAIT'].includes(run.status)) throw createError({ statusCode: 409, message: `Cannot retry process run in ${run.status}` });
  return await repository.updateById(id, {
    status: 'QUEUED',
    runAfter: new Date(),
    claimToken: null,
    workerId: null,
    leaseExpiresAt: null,
    finishedAt: null
  });
}

export async function listProcessRuns(filter = {}) {
  return await repository.list(filter);
}

export function getProcessDefinition(processId) {
  return getCutkitRegistry().getProcessDefinition(processId);
}

export function listProcessDefinitions() {
  return getCutkitRegistry().listProcessDefinitions();
}

function normalizeProcessInput(process, input = {}) {
  const entities = input.entities || {};
  for (const entity of process.input?.entities || []) {
    if (entity.required && !entities[entity.name]) {
      throw createError({ statusCode: 400, message: `Process ${process.id} requires entity ${entity.name}` });
    }
  }
  const parameters = validateFields(process, input.parameters || {});
  return {
    entities,
    parameters
  };
}

function validateFields(process, parameters) {
  const result = {};
  for (const field of process.input?.parameters || []) {
    const value = parameters[field.name] ?? field.default;
    if (field.required && (value === undefined || value === null || value === '')) {
      throw createError({ statusCode: 400, message: `Process ${process.id} requires parameter ${field.name}` });
    }
    if (value === undefined || value === null || value === '') continue;
    result[field.name] = value;
  }
  return result;
}

async function updateRun(id, claimToken, update) {
  return claimToken
    ? await repository.updateClaimedById(id, claimToken, update)
    : await repository.updateById(id, update);
}

function sanitizeAuth(auth = {}) {
  return {
    userId: auth.userId,
    organizationId: auth.organizationId,
    role: auth.role
  };
}
