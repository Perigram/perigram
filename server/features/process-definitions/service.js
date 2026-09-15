import { createError } from 'h3';
import standardSlugify from 'standard-slugify';
import { ObjectId } from 'mongodb';
import { normalizeEntityRef } from '~/packages/core/src/index.js';
import { assertEntityAccess } from '~/server/core/access/service.js';
import { executeCommand } from '~/server/core/commands/service.js';
import { createStatusState } from '~/server/core/blocks/index.js';
import { statusService } from '~/server/core/machines/service.js';
import * as entityRevisionsService from '~/server/features/entity-revisions/service.js';
import * as entityEventService from '~/server/features/entity-events/service.js';
import { getAppRegistry } from '~/server/runtime/app-registry.js';
import { normalizeEntityType } from '~/server/runtime/entities.js';
import {
  compileProcessDefinition,
  diffProcessContracts,
  hasCanonicalProcessSource,
  normalizeProcessDefinition,
  PROCESS_DATAFLOW_VERSION,
  applyPatch,
  evaluateEntityPredicate,
  previewProcessDataflow,
  resumeProcessRun,
  serializeProcessResult,
  validateRoundTrip
} from '~/packages/processes/src/index.js';
import {
  cncDomain,
  getBlockFieldSchema,
  getBlockFieldSchemas,
  getEntityFieldAccessPolicy,
  getEntityFieldSchema,
  getEntityFieldSchemas
} from '~/packages/domain-cnc/src/index.js';
import { getCutkitRegistry } from '~/server/runtime/cutkit-registry.js';
import { toFlexibleId } from '~/server/utils/objectid.js';
import { hasPermissionGrant, normalizePermissionGrants } from '#shared/access-control.js';
import { ProcessDefinition } from './model.js';
import * as repository from './repository.js';
import { normalizeLegacyProcessActions } from './action-migration.js';
import { compileActiveProcessRuntime } from './runtime.js';
import { resolveCompiledRelationOptions } from './relation-option-resolver.js';
import {
  assertCurrentProcessDefinition,
  currentProcessDefinition,
  validateActivatableProcess
} from './compiler-adapter.js';
import {
  continueStoredRun,
  executeManualRun,
  getRunRepository
} from './run-repository.js';
import {
  processChildEntities,
  processParentEntity,
  processRelatedEntities
} from './entity-sources.js';

export async function list(auth) {
  const organizationId = resolveOrganizationId(auth);
  await assertOrgAccess(auth, organizationId, 'read');
  const raws = await repository.find({ 'lineage.organizationId': toFlexibleId(organizationId) });
  // Summaries only: the list is a picker surface. Shipping full records
  // (graph + persisted compiled snapshots) made the response megabytes once
  // activations accumulated; full data loads per id on selection.
  return raws.map(raw => ({
    _id: raw._id,
    identity: raw.identity ? { ...raw.identity } : {},
    status: raw.status ? structuredClone(raw.status) : {},
    lineage: raw.lineage ? { ...raw.lineage } : {}
  }));
}

export async function findRoleReferences(organizationId, roleId) {
  const raws = await repository.find({ 'lineage.organizationId': toFlexibleId(organizationId) });
  return raws
    .filter(raw => raw.status?.state?.primary !== 'ARCHIVED')
    .filter(raw => definitionReferencesRole(raw.data || {}, roleId))
    .map(raw => ({ id: String(raw._id), name: raw.identity?.name || '', status: raw.status?.state?.primary || '' }));
}

function definitionReferencesRole(data = {}, roleId) {
  if (Object.hasOwn(data.roleGrants || {}, roleId)) return true;
  const serialized = JSON.stringify({
    graph: data.graph,
    producerOutputs: data.producerOutputs,
    actions: data.actions,
    services: data.services,
    sockets: data.sockets,
    screens: data.screens,
    processNodes: data.processNodes
  });
  return serialized.includes(`\"${roleId}\"`);
}

export async function getActive(auth) {
  const organizationId = resolveOrganizationId(auth);
  await assertOrgAccess(auth, organizationId, 'read');
  const raw = await repository.findActiveByOrganization(organizationId);
  return raw ? new ProcessDefinition(raw).toJSON() : null;
}

export async function getActiveRelationOptions({ actionId, entityId, source = false } = {}, auth = {}) {
  const organizationId = resolveOrganizationId(auth);
  const raw = await repository.findActiveByOrganization(organizationId);
  if (!raw) throw createError({ statusCode: 404, message: 'Active process definition not found' });
  const process = new ProcessDefinition(raw);
  const organization = await loadOrganizationProcessConfiguration(organizationId);
  const compiled = compileActiveProcessRuntime(process.data, organization.roles);
  const action = compiled?.actions?.[actionId];
  if (!action?.relationMutation || action.relationMutation.operation !== 'link') {
    throw createError({ statusCode: 400, message: 'Action does not provide relation options' });
  }
  assertCompiledActionAvailable(actionId, auth);
  const owner = await resolveProcessGraphEntity(action.entityType, entityId, { auth });
  return resolveCompiledRelationOptions({
    action,
    compiled,
    owner,
    source,
    auth,
    registry: getAppRegistry(),
    createExecutionAuth: createActionExecutionAuth,
    resolveEntity: (entityType, id, executionAuth) => resolveProcessGraphEntity(entityType, id, { auth: executionAuth })
  });
}

export async function getById(id, auth) {
  const process = await loadAuthorized(id, auth, 'read');
  return process.toJSON();
}

export async function create(payload = {}, auth) {
  const organizationId = payload.organizationId || resolveOrganizationId(auth);
  await assertOrgAccess(auth, organizationId, 'write');
  const name = payload.name || payload.identity?.name || 'Organization process';
  const process = new ProcessDefinition({
    identity: {
      uid: `process-${new ObjectId().toString().slice(0, 8)}`,
      name,
      slug: standardSlugify(name, { keepCase: false })
    },
    lineage: { organizationId: toFlexibleId(organizationId) },
    data: currentProcessDefinition(payload.data || payload, getDomain())
  });
  applyProcessStatus(process, 'DRAFT', auth.userId, 'Process draft created');
  const created = await repository.create(process);
  return new ProcessDefinition(created).toJSON();
}

export async function update(id, payload = {}, auth) {
  const process = await loadAuthorized(id, auth, 'write');
  if (process.status?.state?.primary === 'ACTIVE') {
    throw createError({ statusCode: 409, message: 'Active process definitions cannot be edited directly' });
  }
  if (payload.identity?.name || payload.name) {
    process.identity.name = payload.identity?.name || payload.name;
  }
  process.data = currentProcessDefinition(payload.data || payload, getDomain());
  process.data.compiled = null;
  const updated = await repository.updateById(id, process);
  return new ProcessDefinition(updated).toJSON();
}

// The semantic Apply diff recomputes both sides from the canonical authored
// definitions instead of trusting the stored `compiled` snapshot (which is
// inspection-only). Returns null when there is no distinct active definition
// or the previous contract can no longer be compiled for comparison.
async function activeContractBaseline(process, auth) {
  const active = await repository.findActiveByOrganization(process.lineage.organizationId);
  if (!active || String(active._id) === String(process._id)) return null;
  try {
    const data = currentProcessDefinition(active.data, getDomain());
    const roles = await loadOrganizationRoles(process.lineage.organizationId);
    return compileProcessDefinition(data, getDomain(), { roles });
  } catch {
    return null;
  }
}

async function contractDiffFor(process, auth) {
  const baseline = await activeContractBaseline(process, auth);
  if (!baseline) return null;
  const roles = await loadOrganizationRoles(process.lineage.organizationId);
  try {
    return diffProcessContracts(baseline, compileProcessDefinition(process.data, getDomain(), { roles }));
  } catch {
    return null;
  }
}

// Activation must not silently orphan live entities on workflow states the
// next contract removes: the author first migrates those entities (through
// the status engine) or keeps the states. Entity types whose status check
// cannot run are not treated as affected.
async function assertNoStrandedEntityStatuses(process, auth, nextCompiled) {
  const baseline = await activeContractBaseline(process, auth);
  if (!baseline) return;
  const removed = diffProcessContracts(baseline, nextCompiled).removedEntityStatuses;
  const affected = [];
  for (const { entityType, statuses } of removed) {
    let entities = [];
    try {
      entities = await queryProcessGraphEntities(entityType, {}, auth);
    } catch {
      continue;
    }
    const count = entities.filter(entity => statuses.includes(entity?.status?.state?.primary)).length;
    if (count) affected.push({ entityType, statuses, count });
  }
  if (affected.length) {
    const detail = affected.map(item => `${item.entityType} ${item.statuses.join(', ')} (${item.count})`).join('; ');
    throw createError({
      statusCode: 409,
      message: `Removed workflow states still used by active entities require a migration decision: ${detail}`,
      data: { migrationRequired: true, affected }
    });
  }
}

export async function validate(id, auth) {
  const process = await loadAuthorized(id, auth, 'write');
  process.data = currentProcessDefinition(process.data, getDomain());
  assertCanonicalProcessSource(process.data);
  const validation = validateActivatableProcess(process.data, getDomain(), await loadOrganizationRoles(process.lineage.organizationId));
  return { ...validation, diff: await contractDiffFor(process, auth) };
}

export async function activate(id, auth) {
  const process = await loadAuthorized(id, auth, 'admin');
  process.data = currentProcessDefinition(process.data, getDomain());
  assertCanonicalProcessSource(process.data);
  const roles = await loadOrganizationRoles(process.lineage.organizationId);
  const validation = validateActivatableProcess(process.data, getDomain(), roles);
  if (!validation.ok) {
    throw createError({ statusCode: 400, message: validation.errors.join('; '), data: validation });
  }
  const roundTrip = validateRoundTrip(process.data);
  if (!roundTrip.ok) {
    throw createError({ statusCode: 400, message: roundTrip.errors.join('; '), data: roundTrip });
  }
  process.data = {
    ...process.data,
    compiled: compileProcessDefinition(process.data, getDomain(), { roles })
  };
  await assertNoStrandedEntityStatuses(process, auth, process.data.compiled);
  await repository.archiveActiveByOrganization(process.lineage.organizationId, auth.userId);
  applyProcessStatus(process, 'ACTIVE', auth.userId, 'Process activated');
  const updated = await repository.updateById(id, process);
  await organizationProcessService().setActiveProcessDefinition(process.lineage.organizationId, updated._id);
  return new ProcessDefinition(updated).toJSON();
}

export async function createActiveEmptyProcess({ organizationId, actorId } = {}) {
  if (!organizationId) throw createError({ statusCode: 400, message: 'Organization id is required' });

  const organizationIdValue = toFlexibleId(organizationId);
  const process = new ProcessDefinition({
    identity: {
      uid: `process-${organizationIdValue}`,
      name: 'Process',
      slug: 'process'
    },
    lineage: { organizationId: organizationIdValue },
    data: {
      schemaVersion: 1,
      dataflowVersion: PROCESS_DATAFLOW_VERSION,
      graph: { nodes: [], edges: [] },
      roleGrants: { role_admin: [] },
      producerOutputs: {},
      actions: {},
      services: {},
      sockets: {},
      screens: {},
      statusDefinitions: {},
      valueInputs: {},
      processNodes: {},
      compiled: null
    }
  });
  assertCurrentProcessDefinition(process.data);

  const roles = await loadOrganizationRoles(organizationId);
  const validation = validateActivatableProcess(process.data, getDomain(), roles);
  if (!validation.ok) {
    throw createError({ statusCode: 400, message: validation.errors.join('; '), data: validation });
  }

  process.data = {
    ...process.data,
    compiled: compileProcessDefinition(process.data, getDomain(), { roles })
  };
  applyProcessStatus(process, 'ACTIVE', actorId || 'SYSTEM', 'Process activated (empty)');

  await repository.archiveActiveByOrganization(organizationId, actorId || 'SYSTEM');
  const created = await repository.create(process);
  await organizationProcessService().setActiveProcessDefinition(organizationId, created._id);

  return new ProcessDefinition(created).toJSON();
}

export async function archive(id, auth) {
  const process = await loadAuthorized(id, auth, 'admin');
  applyProcessStatus(process, 'ARCHIVED', auth.userId, 'Process archived');
  const updated = await repository.updateById(id, process);
  return new ProcessDefinition(updated).toJSON();
}

function manualRunEnvironment(definition, auth = {}) {
  return {
    executeEffect: (request, run) => executeDurableEffect(request, auth, run, definition.data),
    isAsyncBoundary: (request, result) => request.kind === 'effect.runCommand' && hasAsyncOutputBoundary(result),
    catalogContext: catalogContextFromDefinition(definition.data),
    domain: getDomain(),
    data: run => processDataEnvironment(auth, run)
  };
}

export async function startRun(id, payload = {}, auth = {}, options = {}) {
  const process = await loadAuthorized(id, auth, 'read');
  const definition = process.toJSON();
  if (Number(definition.data?.dataflowVersion) !== PROCESS_DATAFLOW_VERSION) {
    throw createError({ statusCode: 409, message: `Process must use dataflow version ${PROCESS_DATAFLOW_VERSION} before it can run` });
  }
  const organizationId = resolveOrganizationId(auth);
  const actor = buildRunActor(auth, organizationId);
  const runRepository = options.runRepository || getRunRepository(await repository.getConnection());
  return serializeProcessResult(await executeManualRun(definition, payload, {
    actor,
    repository: runRepository,
    ...manualRunEnvironment(definition, auth)
  }));
}

function buildRunActor(auth, organizationId) {
  return {
    userId: auth.userId,
    organizationId,
    role: auth.role,
    isAdmin: Boolean(auth.isAdmin),
    memberships: auth.memberships || [],
    roleAssignments: auth.roleAssignments || {},
    permissions: auth.permissions || [],
    effectivePermissions: auth.effectivePermissions || {}
  };
}

function catalogContextFromDefinition(processData) {
  return record => {
    const structural = ['record.getField', 'record.composeBlock', 'record.modifyBlock'].includes(record.kind);
    return {
      fieldSchema: structural ? getBlockFieldSchema(record.path) : getEntityFieldSchema(record.entityType, record.path),
      fieldSchemas: structural ? getBlockFieldSchemas(record.block) : getEntityFieldSchemas(record.entityType),
      blockComposition: cncDomain.blockComposition?.[record.block] || null,
      command: record.commandId ? getAppRegistry().getCommandDefinition(record.commandId) : null
    };
  };
}

async function loadRunRecord(runRepository, runId) {
  const runRecord = await runRepository.collection('runs').findOne({ _id: String(runId) });
  if (!runRecord) throw createError({ statusCode: 404, message: 'Process run not found' });
  return runRecord;
}

function projectedCompletionOutput(invocation, taskResult = {}) {
  const expected = invocation.expectedCompletionSockets || [];
  const entities = expected.length
    ? (taskResult.entities || []).filter(entity => expected.includes(entity?.type))
    : (taskResult.entities || []);
  return {
    entities,
    attachments: taskResult.attachments || [],
    data: taskResult.data || {},
    events: taskResult.events || []
  };
}

function failRunState(state, { error, cancelled }) {
  const next = structuredClone(state);
  const failure = { message: error?.message || String(error || 'Task failed'), statusCode: error?.statusCode || null };
  const pendingStepId = next.pendingEffect?.stepId;
  if (pendingStepId) {
    const step = next.steps.find(item => item.id === pendingStepId);
    if (step) {
      step.status = cancelled ? 'cancelled' : 'failed';
      step.error = failure;
      step.completedAt = new Date().toISOString();
    }
  }
  delete next.pendingEffect;
  next.status = cancelled ? 'cancelled' : 'failed';
  next.error = failure;
  next.updatedAt = new Date().toISOString();
  return next;
}

export async function ingestTaskCompletion({ taskRunId, taskResult = {} } = {}) {
  const runRepository = getRunRepository(await repository.getConnection());
  const invocation = await runRepository.findInvocationByTaskRunId(taskRunId);
  if (!invocation) return { applied: false, reason: 'uncorrelated' };
  const runRecord = await loadRunRecord(runRepository, invocation.runId);
  const definition = runRecord.definition;
  const actor = runRecord.state?.context?.actor || {};

  const ingested = await runRepository.ingestReceipt({
    invocationId: invocation.invocationId,
    socketId: '',
    output: projectedCompletionOutput(invocation, taskResult)
  }, {
    advance: async ({ invocation: claimed, output, session }) => {
      const current = await runRepository.collection('runs').findOne({ _id: claimed.runId }, { session });
      const resumed = await resumeProcessRun(current.state, definition.data, {
        invocationId: claimed.invocationId,
        output
      }, {
        catalogContext: catalogContextFromDefinition(definition.data),
        domain: getDomain(),
        data: run => processDataEnvironment(actor, run)
      });
      return { state: resumed };
    }
  });
  if (!ingested.applied) return ingested;

  const refreshed = await loadRunRecord(runRepository, invocation.runId);
  await continueStoredRun(refreshed, definition, {}, {
    actor,
    repository: runRepository,
    ...manualRunEnvironment(definition, actor)
  });
  return ingested;
}

export async function failTaskInvocation({ taskRunId, error = null, cancelled = false } = {}) {
  const runRepository = getRunRepository(await repository.getConnection());
  const invocation = await runRepository.findInvocationByTaskRunId(taskRunId);
  if (!invocation) return { applied: false, reason: 'uncorrelated' };
  return runRepository.failInvocation(invocation.invocationId, { error, cancelled }, {
    advance: async ({ invocation: claimed, session }) => {
      const current = await runRepository.collection('runs').findOne({ _id: claimed.runId }, { session });
      return { state: failRunState(current.state, { error, cancelled }) };
    }
  });
}

export async function reconcileProcessTaskRuns() {
  const runRepository = getRunRepository(await repository.getConnection());
  const { getTaskRunById } = await import('../../core/tasks/service.js');
  const pending = await runRepository.findUnreceiptedInvocations();
  const summary = { scanned: pending.length, ingested: 0, failed: 0, skipped: 0 };
  for (const invocation of pending) {
    const taskRunId = invocation.dispatch?.taskRunId;
    if (!taskRunId) {
      summary.skipped += 1;
      continue;
    }
    let taskRun = null;
    try {
      taskRun = await getTaskRunById(String(taskRunId));
    } catch {
      summary.skipped += 1;
      continue;
    }
    if (!taskRun || !['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(taskRun.status)) {
      summary.skipped += 1;
      continue;
    }
    const outcome = taskRun.status === 'SUCCEEDED'
      ? await ingestTaskCompletion({ taskRunId: String(taskRunId), taskResult: taskRun.output || {} })
      : await failTaskInvocation({
        taskRunId: String(taskRunId),
        error: taskRun.error || { message: `Task run ${taskRun.status}` },
        cancelled: taskRun.status === 'CANCELLED'
      });
    if (outcome?.applied) {
      if (taskRun.status === 'SUCCEEDED') summary.ingested += 1;
      else summary.failed += 1;
    } else {
      summary.skipped += 1;
    }
  }
  return summary;
}

export async function preview({ definition, nodeId = '', trigger = {}, inputs = {} } = {}, auth = {}) {
  const organizationId = resolveOrganizationId(auth);
  await assertOrgAccess(auth, organizationId, 'read');
  if (!definition || Number((definition.data || definition).dataflowVersion) !== PROCESS_DATAFLOW_VERSION) {
    throw createError({ statusCode: 400, message: `Preview requires dataflow version ${PROCESS_DATAFLOW_VERSION}` });
  }
  const run = { context: { inputs }, trigger };
  // Preview results cross the HTTP boundary, so the missing-field markers
  // produced by the evaluator are converted to their serializable tag here —
  // the single emission conversion point shared with any runtime result
  // emission (see packages/processes/src/missing-field.js).
  return serializeProcessResult(await previewProcessDataflow(definition, { trigger, inputs }, {
    targetNodeId: nodeId,
    previewLimit: 100,
    domain: getDomain(),
    catalogContext: record => {
      const structural = ['record.getField', 'record.composeBlock', 'record.modifyBlock'].includes(record.kind);
      return {
        fieldSchema: structural ? getBlockFieldSchema(record.path) : getEntityFieldSchema(record.entityType, record.path),
        fieldSchemas: structural ? getBlockFieldSchemas(record.block) : getEntityFieldSchemas(record.entityType),
        blockComposition: cncDomain.blockComposition?.[record.block] || null,
        command: record.commandId ? getAppRegistry().getCommandDefinition(record.commandId) : null
      };
    },
    data: processDataEnvironment(auth, run)
  }));
}

export async function projectEntityThroughSocket({ socketId, entityId, targetOrganizationId } = {}, auth = {}) {
  const organizationId = resolveOrganizationId(auth);
  await assertOrgAccess(auth, organizationId, 'read');
  if (!socketId) throw createError({ statusCode: 400, message: 'Socket id is required' });
  if (!entityId) throw createError({ statusCode: 400, message: 'Entity id is required' });

  const raw = await repository.findActiveByOrganization(organizationId);
  if (!raw) throw createError({ statusCode: 404, message: 'Active process definition not found' });
  const process = new ProcessDefinition(raw);
  const socket = process.data.sockets?.[socketId];
  if (!socket) throw createError({ statusCode: 404, message: 'Socket not found in active process' });
  if (socket.direction === 'inbound') {
    throw createError({ statusCode: 400, message: 'Inbound sockets receive projected entities and cannot project source entities' });
  }

  const registry = getCutkitRegistry();
  const service = registry.getEntityService(socket.entityType);
  if (!service?.processGetById) throw createError({ statusCode: 500, message: `Entity service cannot read ${socket.entityType} from a process` });
  const entity = await service.processGetById(entityId, auth);
  if (!entity) throw createError({ statusCode: 404, message: `${socket.entityType} not found` });

  const domainEntity = (getDomain().entities || []).find(item => item.type === socket.entityType);
  assertEntityAccess({
    entity,
    entityType: socket.entityType,
    feature: socket.feature || domainEntity?.collection || `${socket.entityType}s`,
    level: 'read',
    auth
  });

  return {
    socketId,
    entityType: socket.entityType,
    sourceOrganizationId: organizationId,
    targetOrganizationId: targetOrganizationId || null,
    projection: projectEntityFields(entity.toJSON ? entity.toJSON() : entity, socket.projection || {}),
    receiverLifecycle: socket.receiverLifecycle || { mode: 'defaultCreated' },
    visibility: socket.visibility || {}
  };
}

export async function executeActiveProcessAction({ actionId, entityId, data = {}, parameters = {}, entities = {}, targetOrganizationId = null } = {}, auth = {}) {
  const organizationId = resolveOrganizationId(auth);
  if (!actionId) throw createError({ statusCode: 400, message: 'Action id is required' });
  const raw = await repository.findActiveByOrganization(organizationId);
  if (!raw) throw createError({ statusCode: 404, message: 'Active process definition not found' });

  const process = new ProcessDefinition(raw);
  const organization = await loadOrganizationProcessConfiguration(organizationId);
  const compiled = compileActiveProcessRuntime(process.data, organization.roles);
  const action = compiled?.actions?.[actionId];
  if (!action) throw createError({ statusCode: 404, message: 'Action not found in active process' });
  assertCompiledActionAvailable(actionId, auth);
  if (action.relationMutation) {
    if (data?.relationCreator) {
      const creatorId = action.relationMutation.creator?.actionId;
      const creatorAction = creatorId && compiled.actions?.[creatorId];
      if (!creatorAction || creatorAction.entityType !== action.relationMutation.targetType) {
        throw createError({ statusCode: 400, message: 'Relation action has no compatible creator' });
      }
      const created = await executeDataflowActionRun({
        process,
        actionId: creatorId,
        entityId: null,
        data: data.relationCreator,
        parameters: {},
        entities,
        targetOrganizationId: null
      }, createActionExecutionAuth(auth, creatorAction));
      const createdId = entityInputId(created);
      if (!createdId) throw createError({ statusCode: 500, message: `Created ${creatorAction.entityType} has no id` });
      const owner = await executeCompiledRelationMutationAction({
        action,
        actionId,
        entityId,
        data: {
          relations: { [action.relationMutation.key]: { type: creatorAction.entityType, id: createdId } },
          ...(data.relationReplaces ? { relationReplaces: data.relationReplaces } : {})
        },
        entities
      }, auth);
      return { created, owner };
    }
    return await executeCompiledRelationMutationAction({ action, actionId, entityId, data, entities }, auth);
  }
  assertCurrentProcessDefinition(process.data);
  return executeDataflowActionRun({
    process,
    actionId,
    entityId,
    data,
    parameters,
    entities,
    targetOrganizationId
  }, auth);
}

async function executeCompiledRelationMutationAction({ action, actionId, entityId, data = {}, entities = {} } = {}, auth = {}) {
  const targetValue = entityId || entities?.entity || entities?.[action.entityType];
  const targetId = normalizeEntityRef(targetValue)?.id || targetValue;
  if (!targetId) throw createError({ statusCode: 400, message: 'Entity id is required' });
  const entityType = resolveActionEntityType(action);
  const executionAuth = createActionExecutionAuth(auth, action);
  const selectedMutation = pickMutationData(data, action, entities);
  if (data.relationReplaces) selectedMutation.relationReplaces = data.relationReplaces;
  const mutation = await resolveManualRelationMutation(
    entityType,
    targetId,
    selectedMutation,
    action,
    executionAuth
  );
  const updated = await persistProcessEntityPatch(entityType, targetId, flattenMutationPatch(mutation), executionAuth);
  await publishActionEntityEvent(auth, entityType, updated || { _id: targetId }, 'updated', 'process-relation-update');
  return updated;
}

async function resolveManualRelationMutation(entityType, targetId, mutation = {}, action = {}, auth = {}) {
  const contract = action.relationMutation;
  const key = contract?.key;
  const targetValue = getByPath(mutation, `relations.${key}`);
  const targetRef = normalizeRelationRef(targetValue, contract?.targetType);
  await assertRelationTargetAvailable(targetRef, contract, auth);
  const replacementRef = mutation.relationReplaces
    ? normalizeRelationRef(mutation.relationReplaces, contract?.targetType)
    : null;

  const service = getAppRegistry().getEntityService(entityType);
  const currentRecord = await service?.processGetById?.(targetId, auth);
  if (!currentRecord) throw createError({ statusCode: 404, message: `${entityType} not found` });
  const current = currentRecord?.toJSON ? currentRecord.toJSON() : currentRecord;
  const currentValue = current.relations?.[key];

  if (contract.cardinality !== 'many') {
    if (contract.operation === 'unlink' && currentValue) {
      const currentRef = normalizeRelationRef(currentValue, contract.targetType);
      if (`${currentRef.type}:${currentRef.id}` !== `${targetRef.type}:${targetRef.id}`) {
        throw createError({ statusCode: 400, message: `Selected ${contract.targetType} is not linked through ${key}` });
      }
    }
    return {
      relations: {
        [key]: contract.operation === 'unlink' ? null : targetRef
      }
    };
  }

  const refs = (Array.isArray(currentValue) ? currentValue : currentValue ? [currentValue] : [])
    .map(item => normalizeRelationRef(item, contract.targetType));
  const targetKey = `${targetRef.type}:${targetRef.id}`;
  const replacementKey = replacementRef ? `${replacementRef.type}:${replacementRef.id}` : '';
  if (replacementRef && !refs.some(ref => `${ref.type}:${ref.id}` === replacementKey)) {
    throw createError({ statusCode: 400, message: `Selected ${contract.targetType} is not linked through ${key}` });
  }
  const retained = replacementRef
    ? refs.filter(ref => `${ref.type}:${ref.id}` !== replacementKey)
    : refs;
  const next = contract.operation === 'unlink'
    ? retained.filter(ref => `${ref.type}:${ref.id}` !== targetKey)
    : Array.from(new Map([...retained, targetRef].map(ref => [`${ref.type}:${ref.id}`, ref])).values());
  const result = { relations: { [key]: next } };
  const associationPath = contract.association?.path;
  if (associationPath) {
    const currentAssociations = getByPath(current, associationPath);
    const associations = Array.isArray(currentAssociations) ? currentAssociations : [];
    const associationKey = item => `${item?.type || contract.targetType}:${item?.id || ''}`;
    const retainedAssociations = replacementRef
      ? associations.filter(item => associationKey(item) !== replacementKey)
      : associations;
    const replacementAssociation = replacementRef
      ? associations.find(item => associationKey(item) === replacementKey)
      : null;
    const nextAssociations = contract.operation === 'unlink'
      ? retainedAssociations.filter(item => associationKey(item) !== targetKey)
      : [
          ...retainedAssociations.filter(item => associationKey(item) !== targetKey),
          {
            ...(contract.association.defaults || {}),
            ...(replacementAssociation || {}),
            type: targetRef.type,
            entityType: targetRef.type,
            id: targetRef.id
          }
        ];
    setByPath(result, associationPath, nextAssociations);
  }
  return result;
}

async function executeDataflowActionRun({ process, actionId, entityId, data, parameters, entities, targetOrganizationId }, auth) {
  const effect = Object.values(process.data.processNodes || {})
    .find(node => node.id === actionId && node.kind?.startsWith('effect.'));
  if (!effect || (effect.trigger?.mode || 'manual') !== 'manual') {
    throw createError({ statusCode: 409, message: `Action ${actionId} has no entry trigger` });
  }
  const graphNode = (process.data.graph?.nodes || [])
    .find(node => String(node.data?.refId || node.id) === String(effect.id));
  if (!graphNode) throw createError({ statusCode: 409, message: `Action ${actionId} has no graph node` });
  let run = await startRun(process.id, {
    trigger: { nodeId: graphNode.id },
    inputs: {
      entity: entityId || entities?.entity || null,
      entities,
      data,
      parameters,
      targetOrganizationId
    }
  }, auth);
  if (run.status === 'failed') {
    throw createError({ statusCode: 400, message: run.error?.message || `Action ${actionId} failed` });
  }
  const effectStep = [...(run.steps || [])].reverse().find(step => step.kind?.startsWith('effect.'));
  return effectStep?.output ?? run.result;
}

export async function resolveProcessGraphEntity(entityType, candidate, { entityId = null, entities = {}, auth = {} } = {}) {
  if (candidate && typeof candidate === 'object' && !Array.isArray(candidate) && !normalizeEntityRef(candidate)) {
    return candidate;
  }
  const supplied = candidate ?? entities?.[entityType] ?? entities?.entity ?? entityId;
  const ref = normalizeEntityRef(supplied);
  const id = ref?.id || (typeof supplied === 'string' ? supplied : null);
  if (!id) throw new Error(`No ${entityType} entity was supplied to the process graph`);
  const service = getAppRegistry().getEntityService(entityType);
  if (!service?.processGetById) throw new Error(`Entity service cannot read ${entityType} from a process`);
  const entity = await service.processGetById(id, auth);
  if (!entity) throw new Error(`${entityType} ${id} was not found`);
  return entity?.toJSON ? entity.toJSON() : entity;
}

// List adapters have feature-specific filter contracts. Equality on a normal
// persisted field is the one source predicate they all already share; leave
// every other predicate for the evaluator rather than risking a narrower read.
export function processQueryFilters(predicate) {
  if (predicate?.kind !== 'field' || predicate.operation !== 'eq') return {};
  if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(predicate.path || '')) return {};
  return { [predicate.path]: predicate.value };
}

export async function executeProcessQuery(processList, predicate, auth) {
  const values = await processList(processQueryFilters(predicate), auth);
  return predicate ? values.filter(entity => evaluateEntityPredicate(predicate, entity)) : values;
}

async function queryProcessGraphEntities(entityType, filters = {}, auth = {}) {
  const service = getAppRegistry().getEntityService(entityType);
  if (!service?.processList) throw new Error(`Entity service cannot query ${entityType} from a process`);
  const entities = await service.processList(filters, auth);
  return (entities || []).map(entity => entity?.toJSON ? entity.toJSON() : entity);
}

async function linkCreatedEntityToContextRelation({ action = {}, data = {}, entities = {}, created = null, auth = {} } = {}) {
  const link = data?.linkCreatedTo;
  if (!link || typeof link !== 'object') return null;
  const ownerType = normalizeEntityType(link.ownerType || '');
  const targetType = resolveActionEntityType(action);
  const relation = (getDomain().relations || []).find(item => (
    normalizeEntityType(item.ownerType) === ownerType
    && item.key === link.relationKey
    && normalizeEntityType(item.targetType) === targetType
    && item.cardinality === 'many'
  ));
  if (!relation) throw createError({ statusCode: 400, message: `${ownerType}.${link.relationKey || ''} is not a declared ${targetType} relation` });
  const ownerId = entityInputId(entities[ownerType]);
  const createdId = entityInputId(created);
  if (!ownerId) throw createError({ statusCode: 400, message: `${ownerType} context is required to link the created entity` });
  if (!createdId) throw createError({ statusCode: 500, message: `Created ${targetType} has no id` });
  const ownerService = getAppRegistry().getEntityService(ownerType);
  if (!ownerService?.processGetById || !ownerService?.processUpdate) {
    throw createError({ statusCode: 500, message: `${ownerType} does not support process relation updates` });
  }
  const linkAuth = createRelationLinkExecutionAuth(auth, action, ownerType);
  const owner = await ownerService.processGetById(ownerId, linkAuth);
  if (!owner) throw createError({ statusCode: 404, message: `${ownerType} not found` });
  const existing = Array.isArray(owner.relations?.[relation.key]) ? owner.relations[relation.key] : [];
  const next = existing.some(ref => ref.type === targetType && String(ref.id) === String(createdId))
    ? existing
    : [...existing, { type: targetType, id: createdId }];
  const patch = { [`relations.${relation.key}`]: next };
  if (relation.association?.path) {
    const associations = getByPath(owner, relation.association.path);
    const currentAssociations = Array.isArray(associations) ? associations : [];
    if (!currentAssociations.some(item => String(item?.id) === String(createdId))) {
      patch[relation.association.path] = [
        ...currentAssociations,
        {
          ...(relation.association.defaults || {}),
          type: targetType,
          entityType: targetType,
          id: createdId
        }
      ];
    }
  }
  const updated = await ownerService.processUpdate(ownerId, patch, linkAuth);
  await publishActionEntityEvent(auth, ownerType, updated || { _id: ownerId }, 'updated', 'process-created-relation-link');
  return updated;
}

function entityInputId(value) {
  if (!value) return null;
  if (typeof value !== 'object') return value;
  const tree = Array.isArray(value.branches) ? value : (Array.isArray(value.result?.branches) ? value.result : null);
  if (tree) {
    const items = tree.branches.flatMap(branch => branch.items || []).filter(item => item && !item.error);
    return items.length === 1 ? entityInputId(items[0]) : null;
  }
  return value.id || value._id || value.identity?.uid || null;
}

async function applyProcessOutputStatuses({ actionId, result = {}, processData = {}, organizationId, auth = {} } = {}) {
  const statusesByEntityType = commandOutputStatusMap(actionId, processData);
  if (!statusesByEntityType.size) return;
  for (const entityRef of result.entities || []) {
    const entityType = normalizeEntityType(entityRef.type || entityRef.entityType || '');
    const statusTargets = statusesByEntityType.get(entityType) || [];
    if (statusTargets.length > 1) {
      throw new Error(`Process command action ${actionId} has ambiguous status outputs for ${entityType}`);
    }
    const statusTarget = statusTargets[0];
    const targetState = statusTarget?.targetState;
    const targetId = entityRef.id || entityRef._id;
    if (!entityType || !targetState || !targetId) continue;
    await statusService.setInitialStateForOrganization(
      entityType,
      targetId,
      targetState,
      organizationId,
      auth.userId,
      processStatusMetadata({
        entityType,
        producerOutputId: statusTarget.producerOutputId,
        status: { to: targetState }
      }, `Created by process command action ${actionId}`, processData)
    );
    await entityEventService.publishEntityChanged(auth, {
      type: entityType,
      id: targetId,
      change: 'updated',
      reason: 'process-command-output-status'
    });
  }
}

async function publishStatusResultEvents(auth, entityType, targetId, result = {}, reason = 'process-status-action') {
  await entityEventService.publishEntityChanged(auth, {
    type: entityType,
    id: result.entity?._id || targetId,
    change: 'updated',
    reason
  });
  for (const changed of normalizedEffectEntities(result.effects)) {
    await entityEventService.publishEntityChanged(auth, {
      type: changed.type,
      id: changed.id || changed.entity?._id,
      change: 'updated',
      reason: `${reason}-effect`
    });
  }
}

async function publishActionEntityEvent(auth, entityType, entity, change, reason) {
  await entityEventService.publishEntityChanged(auth, {
    type: entityType,
    id: entityId(entity),
    change,
    reason
  });
}

function normalizedEffectEntities(effects) {
  if (!effects) return [];
  if (Array.isArray(effects)) return effects.flatMap(effect => effect?.entities || []);
  return effects.entities || [];
}

function entityId(entity = {}) {
  return entity?._id || entity?.id || entity?.identity?.uid || null;
}

function hasAsyncOutputBoundary(result = {}) {
  return (result.tasks || []).length > 0
    || (result.raw?.tasks || []).length > 0
    || [...(result.jobs || []), ...(result.raw?.jobs || [])].some(job => ['task_run', 'task'].includes(job?.type));
}

function commandOutputStatusMap(actionId, processData = {}) {
  const sourceNodeIds = new Set([String(actionId)]);
  const actionIdByNodeId = new Map();
  for (const node of processData.graph?.nodes || []) {
    if (node.type && node.type !== 'action') continue;
    const nodeActionId = String(node.data?.refId || node.id || '');
    const nodeId = String(node.id || '');
    if (!nodeActionId || !nodeId) continue;
    actionIdByNodeId.set(nodeId, nodeActionId);
    if (nodeActionId === String(actionId)) sourceNodeIds.add(nodeId);
  }
  const map = new Map();
  for (const edge of processData.graph?.edges || []) {
    if (!sourceNodeIds.has(String(edge.source))) continue;
    const targetActionId = actionIdByNodeId.get(String(edge.target)) || String(edge.target);
    const targetAction = targetActionId ? processData.actions?.[targetActionId] : null;
    if (targetAction?.actionKind !== 'updateEntity' || !(targetAction.status?.to || targetAction.access?.statusTo)) continue;
    const entityType = normalizeEntityType(
      targetAction.entityType
      || targetAction.inputs?.find(input => input.entityType)?.entityType
      || String(edge.sourceHandle || '').replace(/^output:/, '')
    );
    const targetState = targetAction.status?.to || targetAction.access?.statusTo;
    if (entityType && targetState) {
      const targets = map.get(entityType) || [];
      targets.push({ targetState, producerOutputId: targetAction.producerOutputId || null });
      map.set(entityType, targets);
    }
  }
  return map;
}

function processStatusMetadata(action = {}, note = '', processData = {}) {
  const display = actionStatusDisplayMetadata(action, processData);
  return {
    note,
    ...(action.producerOutputId ? { producerOutputId: action.producerOutputId } : {}),
    ...(display ? { display } : {})
  };
}

function processTransitionContext(action = {}, data = {}, processData = {}) {
  const source = data?.statusMeta || data?.context || {};
  const display = actionStatusDisplayMetadata(action, processData);
  if (!display) return source;
  if (source?.metadata || source?.lifecycle) {
    return {
      ...source,
      metadata: {
        ...(source.metadata || {}),
        display
      }
    };
  }
  return {
    ...source,
    display
  };
}

function actionStatusDisplayMetadata(action = {}, processData = {}) {
  return statusDisplayMetadata({
    ...statusDefinitionForAction(action, processData),
    ...(action.status || {})
  });
}

function statusDefinitionForAction(action = {}, processData = {}) {
  const statusRef = action.statusRef;
  if (statusRef && processData?.statusDefinitions?.[statusRef]) return processData.statusDefinitions[statusRef];
  const target = action.status?.to || action.access?.statusTo;
  if (!target) return {};
  return Object.values(processData?.statusDefinitions || {}).find(definition => (
    definition?.statusId === target || definition?.id === target
  )) || {};
}

function statusDisplayMetadata(status = {}) {
  const display = {
    ...(status.label ? { label: status.label } : {}),
    ...(status.color || status.severity ? { color: status.color || status.severity } : {}),
    ...(status.severity || status.color ? { severity: status.severity || status.color } : {}),
    ...(status.icon ? { icon: status.icon } : {})
  };
  return Object.keys(display).length ? display : null;
}

export async function getByIdInternal(id) {
  const raw = await repository.findById(id);
  return raw ? new ProcessDefinition(raw).toJSON() : null;
}

function applyProcessStatus(process, primary, userId, note) {
  process.applyStatus(createStatusState(primary), userId || 'SYSTEM', { note });
}

function assertCompiledActionAvailable(actionId, auth = {}) {
  const available = auth.roleAssignments?.actions || [];
  if (!available.some(action => action.actionId === actionId)) {
    throw createError({ statusCode: 403, message: `Action ${actionId} is not available to the current process role` });
  }
}

function resolveActionEntityType(action = {}) {
  return normalizeEntityType(action.entityType || action.inputs?.find(input => input.entityType)?.entityType || '');
}

function getEntityServiceForAction(action = {}) {
  const entityType = resolveActionEntityType(action);
  if (!entityType) throw createError({ statusCode: 400, message: `Action ${action.id} has no entity type` });
  const service = getAppRegistry().getEntityService(entityType);
  if (!service) throw createError({ statusCode: 500, message: `Entity service missing for ${entityType}` });
  return service;
}

function createActionExecutionAuth(auth = {}, action = {}) {
  const feature = resolveActionFeature(action);
  const permissions = {
    ...(auth.effectivePermissions || {})
  };
  if (feature) {
    appendExecutionGrant(permissions, feature, {
      level: action.access?.level || 'write',
      actions: executionActionsForAction(action)
    });
  }
  for (const grant of commandExecutionGrants(action)) {
    appendExecutionGrant(permissions, grant.feature, {
      level: grant.level || 'read',
      actions: grant.actions || { view: true }
    });
  }
  for (const source of constructionSourceGrants(action)) {
    appendExecutionGrant(permissions, source.feature, {
      level: source.level,
      actions: source.actions
    });
  }
  return {
    ...auth,
    effectivePermissions: permissions
  };
}

function createRelationLinkExecutionAuth(auth = {}, action = {}, ownerType = '') {
  const executionAuth = createActionExecutionAuth(auth, action);
  const permissions = {
    ...(executionAuth.effectivePermissions || {})
  };
  appendExecutionGrant(permissions, resolveEntityFeature(ownerType), {
    level: 'write',
    actions: { update: true, edit: true }
  });
  return {
    ...executionAuth,
    effectivePermissions: permissions
  };
}

function commandExecutionGrants(action = {}) {
  if (action.actionKind !== 'runCommand' || !action.commandId) return [];
  const command = getAppRegistry().getCommandDefinition(action.commandId);
  return Array.isArray(command?.access?.executionGrants)
    ? command.access.executionGrants.filter(grant => grant?.feature)
    : [];
}

function executionActionsForAction(action = {}) {
  if (action.actionKind === 'runCommand') return { run: true };
  if (action.actionKind === 'updateEntity') return { update: true, edit: true };
  if (action.actionKind === 'archiveEntity') return { update: true, edit: true, archive: true };
  if (action.actionKind === 'deleteEntity') return { delete: true };
  return { create: true };
}

function appendExecutionGrant(permissions, feature, grant) {
  if (!feature) return;
  permissions[feature] = [
    ...normalizePermissionGrants(permissions[feature]),
    grant
  ];
}

function constructionSourceGrants(action = {}) {
  const sources = [];
  if (action.parentEntityType) {
    sources.push({ entityType: action.parentEntityType, level: 'read', actions: { view: true } });
  }
  if (action.construction?.mode === 'bakeCassetteDesignFromTemplate') {
    sources.push({ entityType: 'cassette', level: 'read', actions: { view: true } });
  }
  if (action.construction?.mode === 'importCassetteDesignFromArtifact') {
    sources.push({ entityType: 'artifact', level: 'read', actions: { view: true } });
  }
  for (const field of [
    ...(action.construction?.inputs || []),
    ...(action.inputPolicy?.fields || []),
    ...(action.inputs || [])
  ]) {
    if (field?.entityType && (field.type === 'entity' || field.kind === 'entity' || field.relationKey || field.id === 'parent')) {
      sources.push({ entityType: field.entityType, level: field.access?.level || 'read', actions: { view: true } });
    }
  }
  const seen = new Set();
  return sources.flatMap(source => {
    const feature = resolveEntityFeature(source.entityType);
    const key = `${feature}:${source.level}`;
    if (!feature || seen.has(key)) return [];
    seen.add(key);
    return [{ ...source, feature }];
  });
}

function resolveActionFeature(action = {}) {
  return resolveEntityFeature(resolveActionEntityType(action));
}

function resolveEntityFeature(entityType = '') {
  entityType = normalizeEntityType(entityType);
  const domain = getDomain();
  const entity = (domain?.entities || []).find(item => item.type === entityType);
  const fieldPolicy = getEntityFieldAccessPolicy(entityType) || domain?.fieldAccess?.[entityType];
  if (fieldPolicy?.feature) return fieldPolicy.feature;
  if (entity?.feature) return entity.feature;
  if (entity?.collection) return entity.collection;
  return entityType;
}

function pickMutationData(data = {}, action = {}, entities = {}) {
  const fields = action.mutation?.fields || [];
  if (!fields.length) return {};
  const picked = {};
  for (const field of fields) {
    const relationKey = field.startsWith('relations.') ? field.slice('relations.'.length) : '';
    const value = getByPath(data, field)
      ?? (relationKey ? (entities[`relation:${relationKey}`] ?? entities[relationKey]) : undefined);
    if (value !== undefined) setByPath(picked, field, value);
  }
  return picked;
}

async function normalizeProcessMutation(entityType, mutation = {}, relationContracts = [], auth = {}) {
  if (!mutation.relations) return mutation;
  const normalizedRelations = {};
  for (const [key, value] of Object.entries(mutation.relations)) {
    const relation = relationContracts.find(item => (
      normalizeEntityType(item.ownerType) === normalizeEntityType(entityType) && item.key === key
    ));
    if (!relation) {
      throw createError({ statusCode: 400, message: `Action cannot write undeclared relation ${entityType}.${key}` });
    }
    const values = Array.isArray(value) ? value : [value];
    const refs = [];
    for (const item of values) {
      const ref = normalizeRelationRef(item, relation.targetType);
      await assertRelationTargetAvailable(ref, relation, auth);
      refs.push(ref);
    }
    if (relation.cardinality === 'one' && refs.length !== 1) {
      throw createError({ statusCode: 400, message: `Relation ${entityType}.${key} accepts exactly one entity` });
    }
    normalizedRelations[key] = relation.cardinality === 'many'
      ? Array.from(new Map(refs.map(ref => [`${ref.type}:${ref.id}`, ref])).values())
      : refs[0];
  }
  return { ...mutation, relations: normalizedRelations };
}

function processRelationContracts(record = {}, processData = {}) {
  const actionId = String(record.entryTriggerId || record.id || '');
  return normalizeProcessDefinition(processData, getDomain()).actions?.[actionId]?.mutation?.relationContracts || [];
}

function declaredRelationValues(value, contracts = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(contracts
    .filter(contract => Object.hasOwn(value, contract.key))
    .map(contract => [contract.key, value[contract.key]]));
}

async function normalizeProcessPatchRelations(entityType, patch = {}, contracts = [], auth = {}) {
  const relations = Object.fromEntries(contracts.flatMap(contract => (
    Object.hasOwn(patch, `relations.${contract.key}`)
      ? [[contract.key, patch[`relations.${contract.key}`]]]
      : []
  )));
  if (!Object.keys(relations).length) return patch;
  const normalized = await normalizeProcessMutation(entityType, { relations }, contracts, auth);
  return {
    ...patch,
    ...Object.fromEntries(Object.entries(normalized.relations).map(([key, value]) => [`relations.${key}`, value]))
  };
}

async function assertRelationTargetAvailable(ref, relation = {}, auth = {}) {
  const service = getAppRegistry().getEntityService(relation.targetType);
  const target = await service?.processGetById?.(ref.id, auth);
  if (!target) throw createError({ statusCode: 404, message: `${relation.targetType} relation target not found` });
  const entity = target?.toJSON ? target.toJSON() : target;
  const definition = (getDomain().entities || []).find(item => normalizeEntityType(item.type) === normalizeEntityType(relation.targetType));
  assertEntityAccess({
    entity,
    entityType: relation.targetType,
    feature: resolveEntityFeature(definition?.type || relation.targetType),
    level: 'read',
    action: 'view',
    auth
  });
  if (!ref.revisionId) return;
  const revision = await entityRevisionsService.getById(ref.revisionId, auth.userId, auth.role, auth);
  const source = revision?.data?.source;
  if (normalizeEntityType(source?.type) !== normalizeEntityType(relation.targetType) || String(source?.id) !== String(ref.id)) {
    throw createError({ statusCode: 400, message: `Pinned revision does not belong to ${relation.targetType} ${ref.id}` });
  }
}

function normalizeRelationRef(value, targetType) {
  const ref = normalizeEntityRef(typeof value === 'object' ? value : { type: targetType, id: value });
  if (!ref || normalizeEntityType(ref.type) !== normalizeEntityType(targetType)) {
    throw createError({ statusCode: 400, message: `Relation target must be ${targetType}` });
  }
  return { ...ref, type: targetType };
}

async function persistProcessEntityPatch(entityType, targetId, patch, auth) {
  const service = getAppRegistry().getEntityService(entityType);
  if (!service?.processGetById || !service?.processUpdate) {
    throw createError({ statusCode: 500, message: `Entity service cannot persist process updates for ${entityType}` });
  }
  const entityResult = await service.processGetById(targetId, auth);
  const entity = entityResult?.toJSON ? entityResult.toJSON() : entityResult;
  if (!entity) throw createError({ statusCode: 404, message: `${entityType} not found` });
  assertEntityAccess({
    entity,
    entityType,
    feature: resolveEntityFeature(entityType),
    level: 'write',
    action: 'update',
    auth
  });
  return await service.processUpdate(targetId, patch, auth);
}

function flattenMutationPatch(source = {}, prefix = '', result = {}) {
  for (const [key, value] of Object.entries(source || {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && value.type && value.id) {
      result[path] = value;
    } else if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      flattenMutationPatch(value, path, result);
    } else {
      result[path] = value;
    }
  }
  return result;
}

function getByPath(source, path) {
  return String(path || '').split('.').filter(Boolean).reduce((value, key) => value?.[key], source);
}

function setByPath(target, path, value) {
  const parts = String(path || '').split('.').filter(Boolean);
  let cursor = target;
  while (parts.length > 1) {
    const key = parts.shift();
    cursor[key] ||= {};
    cursor = cursor[key];
  }
  if (parts[0]) cursor[parts[0]] = value;
}

function processDataEnvironment(auth, run) {
  const domain = getDomain();
  const resolveEntity = (entityType, idOrRef) => resolveProcessGraphEntity(entityType, idOrRef, { auth });
  const queryEntities = (entityType, filters) => queryProcessGraphEntities(entityType, filters, auth);
  return {
    currentEntity: async entityType => {
      const candidate = run.context?.inputs?.entities?.[entityType] || run.context?.inputs?.entity;
      return candidate ? resolveProcessGraphEntity(entityType, candidate, { auth }) : null;
    },
    entityById: (entityType, id) => resolveProcessGraphEntity(entityType, id, { auth }),
    resolveEntityRef: ref => resolveProcessGraphEntity(ref.type, ref, { auth }),
    parentEntity: (entity, entityType) => processParentEntity(domain.containment, resolveEntity, entity, entityType),
    childEntities: (entity, entityType) => processChildEntities(domain.containment, queryEntities, entity, entityType),
    relatedEntities: (entity, relationKey, entityType) => processRelatedEntities(domain.relations, resolveEntity, entity, relationKey, entityType),
    queryEntities: async (entityType, predicate) => {
      const service = getAppRegistry().getEntityService(entityType);
      if (!service?.processList) throw new Error(`Entity service cannot query ${entityType} from a process`);
      return executeProcessQuery(service.processList, predicate, auth);
    }
  };
}

async function executeDurableEffect(request, auth, run, processData) {
  return await performDurableEffect(request, auth, processData);
}

export async function performDurableEffect({ kind, record, inputs }, auth, processData = {}) {
  if (kind === 'effect.runCommand') {
    if (!record.commandId) throw new Error('Command effect requires commandId');
    return await executeCommand(record.commandId, commandEffectPayload(record.commandId, inputs), auth);
  }
  const entityType = normalizeEntityType(record.entityType || inputs.entity?.type || '');
  if (!entityType) throw new Error(`${kind} requires entityType`);
  const service = getAppRegistry().getEntityService(entityType);
  if (!service) throw new Error(`Entity service missing for ${entityType}`);
  const requiredCapability = {
    'effect.archiveEntity': 'archive',
    'effect.deleteEntity': 'delete'
  }[kind];
  if (requiredCapability && service.processCapabilities?.[requiredCapability] !== true) {
    throw new Error(`${entityType} does not support process ${requiredCapability}`);
  }
  if (kind === 'effect.deleteEntity' && !getDomain().entities?.find(entity => entity.type === entityType)?.operations?.delete) {
    throw new Error(`${entityType} does not declare hard deletion`);
  }
  const relationContracts = ['effect.createEntity', 'effect.updateEntity'].includes(kind)
    ? processRelationContracts(record, processData)
    : [];
  if (kind === 'effect.createEntity' || kind === 'effect.runProducer') {
    const constructionDraft = processConstructionInputRecord(record, inputs);
    let blockDraft = kind === 'effect.createEntity' ? processBlockInputRecord(record, inputs) : {};
    const relationValues = declaredRelationValues(inputs.relations, relationContracts);
    if (Object.keys(relationValues).length) blockDraft = { ...blockDraft, relations: relationValues };
    const executionAuth = createActionExecutionAuth(auth, record);
    blockDraft = await normalizeProcessMutation(entityType, blockDraft, relationContracts, executionAuth);
    const draft = { ...blockDraft, ...constructionDraft };
    const targetState = inputs['status.state.primary'] || record.status?.to;
    const statusMetadata = draft.status?.metadata && typeof draft.status.metadata === 'object'
      ? draft.status.metadata
      : {};
    delete draft.status;
    const mode = record.construction?.mode || '';
    const handler = service.constructionHandlers?.[mode];
    if (typeof handler !== 'function') {
      throw new Error(`No registered handler for construction mode ${mode || '(none)'} on ${entityType}`);
    }
    const organizationId = resolveOrganizationId(auth);
    const created = await handler(draft, {
      userId: auth.userId,
      organizationId,
      role: auth.role,
      executionAuth,
      applyTypedBlocks: result => applyTypedConstructionBlocks(record, blockDraft, result, service, auth)
    });
    const dto = created?.toJSON ? created.toJSON() : created;
    const targetId = entityId(dto);
    const result = targetState && targetId
      ? {
          ...dto,
          status: await statusService.setInitialStateForOrganization(
            entityType,
            targetId,
            targetState,
            organizationId,
            auth.userId,
            {
              ...statusMetadata,
              ...processStatusMetadata(record, `Created by process effect ${record.id}`, processData)
            }
          )
        }
      : dto;
    await publishActionEntityEvent(auth, entityType, result, 'created', 'process-create');
    return result;
  }
  const target = normalizeEntityRef(inputs.entity);
  if (!target?.id) throw new Error(`${kind} requires an entity reference`);
  if (kind === 'effect.updateEntity') {
    const persistedChanges = processBlockInputChanges(record, inputs);
    const statusValue = inputs['status.state.primary'];
    const statusChange = statusValue == null ? null : {
      path: 'status.state.primary',
      operation: 'set',
      value: statusValue
    };
    if (statusChange) {
      let patch = Object.fromEntries(persistedChanges.map(change => {
        if ((change.operation || 'set') !== 'set') throw new Error(`Status transition patch does not support ${change.operation}`);
        return [change.path, change.value];
      }));
      Object.assign(patch, Object.fromEntries(Object.entries(declaredRelationValues(inputs.relations, relationContracts))
        .map(([key, value]) => [`relations.${key}`, value])));
      patch = await normalizeProcessPatchRelations(entityType, patch, relationContracts, auth);
      const result = await statusService.transitionWithResult({
        entityType,
        targetId: target.id,
        targetState: typeof statusChange.value === 'string' ? statusChange.value : statusChange.value?.id,
        auth,
        context: effectTransitionContext(record, inputs),
        patch: Object.keys(patch).length ? patch : null
      });
      return result.entity;
    }
    let patch;
    if (persistedChanges.every(change => (change.operation || 'set') === 'set')) {
      patch = Object.fromEntries(persistedChanges.map(change => [change.path, change.value]));
    } else {
      const current = await resolveProcessGraphEntity(entityType, target, { auth });
      const changeSet = { entityType, changes: persistedChanges };
      const updated = applyPatch(current, changeSet);
      patch = Object.fromEntries(persistedChanges.map(change => {
        const value = getByPath(updated, change.path);
        if (value === undefined) throw new Error(`Persisted entity updates cannot unset ${change.path}`);
        return [change.path, value];
      }));
    }
    Object.assign(patch, Object.fromEntries(Object.entries(declaredRelationValues(inputs.relations, relationContracts))
      .map(([key, value]) => [`relations.${key}`, value])));
    patch = await normalizeProcessPatchRelations(entityType, patch, relationContracts, auth);
    if (!service.processUpdate) throw new Error(`Entity service cannot update ${entityType}`);
    return await service.processUpdate(target.id, patch, auth);
  }
  if (kind === 'effect.changeStatus') {
    const patch = Object.fromEntries((inputs.changes?.changes || []).map(change => {
      if ((change.operation || 'set') !== 'set') throw new Error(`Status transition patch does not support ${change.operation}`);
      return [change.path, change.value];
    }));
    const result = await statusService.transitionWithResult({
      entityType,
      targetId: target.id,
      targetState: typeof inputs.status === 'string' ? inputs.status : inputs.status?.id,
      auth,
      context: effectTransitionContext(record, inputs),
      patch: Object.keys(patch).length ? patch : null
    });
    return result.entity;
  }
  if (kind === 'effect.archiveEntity') {
    const result = await statusService.transitionWithResult({
      entityType,
      targetId: target.id,
      ...(record.archiveIntent ? { intent: record.archiveIntent } : { targetState: 'ARCHIVED' }),
      auth,
      context: effectTransitionContext(record, inputs)
    });
    return result.entity;
  }
  if (kind === 'effect.deleteEntity') {
    if (!service.processDelete) throw new Error(`Entity service cannot delete ${entityType}`);
    return await service.processDelete(target.id, auth);
  }
  if (kind === 'effect.sendEntity') {
    return await projectEntityThroughSocket({
      socketId: record.socketId,
      entityId: target.id,
      targetOrganizationId: record.targetOrganizationId
    }, auth);
  }
  if (kind === 'effect.generateAttachment') {
    if (!record.commandId) throw new Error('Attachment effect requires commandId');
    return await executeCommand(record.commandId, {
      entities: { [entityType]: target },
      parameters: inputs.parameters || {}
    }, auth);
  }
  throw new Error(`Unsupported process effect ${kind}`);
}

function effectTransitionContext(record = {}, inputs = {}) {
  return {
    source: 'process-run',
    ...(record.producerOutputId ? { producerOutputId: record.producerOutputId } : {}),
    ...(inputs.region || record.region ? { region: inputs.region || record.region } : {}),
    ...(inputs.path || record.path ? { path: inputs.path || record.path } : {}),
    ...(inputs.metadata || record.metadata ? { metadata: inputs.metadata || record.metadata } : {}),
    ...(inputs.lifecycle || record.lifecycle ? { lifecycle: inputs.lifecycle || record.lifecycle } : {})
  };
}

async function applyTypedConstructionBlocks(record = {}, blockDraft = {}, created = null, service = null, auth = {}) {
  if (!created || !Object.keys(blockDraft).length) return created;
  if (!service?.processUpdate) throw new Error(`Entity service cannot apply constructed blocks to ${record.entityType}`);
  const targetId = created._id || created.identity?.uid;
  if (!targetId) throw new Error(`Created ${record.entityType} has no id`);
  const patch = Object.fromEntries(Object.entries(blockDraft).map(([block, value]) => [
    block,
    { ...(created[block] || {}), ...(value || {}) }
  ]));
  return await service.processUpdate(targetId, patch, auth);
}

function commandEffectPayload(commandId, inputs = {}) {
  const command = getAppRegistry().getCommandDefinition(commandId);
  if (!command) throw new Error(`Unknown command: ${commandId}`);
  const entities = {};
  for (const input of command.input?.abstractEntities || []) {
    const id = input.name || input.type || input.capability;
    if (Object.hasOwn(inputs, id)) entities[id] = inputs[id];
  }
  const acceptedTypes = new Set((command.input?.abstractEntities || []).flatMap(input => input.accepts || []));
  for (const input of command.input?.entities || []) {
    if (acceptedTypes.has(input.type)) continue;
    const socketId = input.name || input.type;
    if (!Object.hasOwn(inputs, socketId)) continue;
    const value = inputs[socketId];
    entities[input.name || input.type] = input.multiple
      ? (Array.isArray(value) ? value : [value]).map(entityInputId).filter(Boolean)
      : entityInputId(value);
  }
  const parameters = {};
  for (const input of command.input?.parameters || []) {
    if (Object.hasOwn(inputs, input.name)) parameters[input.name] = inputs[input.name];
  }
  return { entities, parameters };
}

function processBlockInputRecord(record = {}, inputs = {}) {
  const result = {};
  const schemas = getEntityFieldSchemas(record.entityType);
  for (const block of record.blocks || []) {
    if (!Object.hasOwn(inputs, block)) continue;
    result[block] = {};
    for (const field of schemas.filter(item => item.block === block && item.constructible !== false)) {
      const localPath = field.path.slice(block.length + 1);
      const value = getByPath(inputs[block], localPath);
      if (value !== undefined) setByPath(result[block], localPath, normalizeBlockFieldValue(field, value));
    }
    if (block === 'lineage') {
      for (const [key, value] of Object.entries(result.lineage || {})) {
        if (key !== 'organizationId' && result[key] === undefined) result[key] = value;
      }
    }
  }
  return result;
}

function processConstructionInputRecord(record = {}, inputs = {}) {
  const result = {};
  for (const input of record.construction?.inputs || []) {
    const id = input.id || input.path;
    if (!id) continue;
    const supplied = Object.hasOwn(inputs, id) ? inputs[id] : input.default;
    if (supplied === undefined) continue;
    const value = input.type === 'entity'
      ? entityInputId(supplied)
      : input.type === 'entityList'
        ? (Array.isArray(supplied) ? supplied : [supplied]).map(entityInputId).filter(Boolean)
        : supplied;
    setByPath(result, input.path || id, value);
  }
  return result;
}

function processBlockInputChanges(record = {}, inputs = {}) {
  const schemas = getEntityFieldSchemas(record.entityType);
  const changes = [];
  for (const block of record.blocks || []) {
    if (!Object.hasOwn(inputs, block)) continue;
    const value = inputs[block];
    for (const field of schemas.filter(item => item.block === block && item.writable !== false)) {
      const localPath = field.path.slice(block.length + 1);
      const fieldValue = getByPath(value, localPath);
      if (fieldValue !== undefined) {
        changes.push({
          path: field.path,
          operation: 'set',
          value: normalizeBlockFieldValue(field, fieldValue)
        });
      }
    }
  }
  return changes;
}

function normalizeBlockFieldValue(field = {}, value) {
  if (field.block === 'lineage' && field.type?.base === 'entityRef') {
    return entityInputId(value);
  }
  return value;
}

async function loadAuthorized(id, auth, level) {
  const raw = await repository.findById(id);
  if (!raw) throw createError({ statusCode: 404, message: 'Process definition not found' });
  const process = new ProcessDefinition(raw);
  await assertOrgAccess(auth, process.lineage.organizationId, level);
  return process;
}

async function assertOrgAccess(auth, organizationId, level) {
  try {
    assertEntityAccess({
      entity: { lineage: { organizationId } },
      entityType: 'organization',
      feature: 'organizations',
      level,
      auth
    });
  } catch (error) {
    if (await hasProcessDefinitionMembershipAccess(auth, organizationId, level)) return;
    throw error;
  }
}

export async function hasProcessDefinitionMembershipAccess(auth = {}, organizationId, level = 'read') {
  if (!['read', 'write', 'admin'].includes(level)) return false;
  const membership = findOrganizationMembership(auth, organizationId);
  if (!membership || membership.status === 'pending' || membership.status === 'rejected') return false;
  if (hasPermissionGrant({ permissions: membership.permissions || {}, feature: 'organizations', level })) return true;
  return false;
}

function findOrganizationMembership(auth = {}, organizationId) {
  const target = organizationId?.toString();
  return (auth.memberships || []).find(item => item.organizationId?.toString() === target);
}

function resolveOrganizationId(auth = {}) {
  const organizationId = auth.organizationId || auth.memberships?.[0]?.organizationId;
  if (!organizationId) throw createError({ statusCode: 403, message: 'Organization membership is required' });
  return organizationId;
}

function getDomain() {
  return getCutkitRegistry().getDomain('cnc');
}

function assertCanonicalProcessSource(data = {}) {
  if (data.compiled && !hasCanonicalProcessSource(data)) {
    throw createError({
      statusCode: 409,
      message: 'Process definition has only a compiled runtime contract; canonical semantic records are required for editing'
    });
  }
}

async function loadOrganizationRoles(organizationId) {
  return (await loadOrganizationProcessConfiguration(organizationId)).roles;
}

function organizationProcessService() {
  const service = getAppRegistry().getEntityService('organization');
  if (!service?.getProcessConfiguration || !service?.setActiveProcessDefinition) {
    throw createError({ statusCode: 500, message: 'Organization process service is not registered' });
  }
  return service;
}

async function loadOrganizationProcessConfiguration(organizationId) {
  const organization = await organizationProcessService().getProcessConfiguration(organizationId);
  if (!organization) throw createError({ statusCode: 404, message: 'Organization not found' });
  return organization;
}

function projectEntityFields(entity, projection = {}) {
  const fields = projection.fields?.length ? projection.fields : ['identity.*', 'status.*'];
  const excluded = projection.excludeFields || [];
  const projected = {};
  for (const field of fields) copyProjectionPath(entity, projected, field);
  for (const field of excluded) deleteProjectionPath(projected, field);
  return projected;
}

function copyProjectionPath(source, target, path) {
  const sourcePath = path.endsWith('.*') ? path.slice(0, -2) : path;
  const value = sourcePath.split('.').reduce((current, segment) => current?.[segment], source);
  if (value === undefined) return;
  const segments = sourcePath.split('.');
  const last = segments.pop();
  const parent = segments.reduce((current, segment) => {
    if (!current[segment] || typeof current[segment] !== 'object') current[segment] = {};
    return current[segment];
  }, target);
  parent[last] = value;
}

function deleteProjectionPath(target, path) {
  const sourcePath = path.endsWith('.*') ? path.slice(0, -2) : path;
  const segments = sourcePath.split('.');
  const last = segments.pop();
  const parent = segments.reduce((current, segment) => current?.[segment], target);
  if (parent && Object.prototype.hasOwnProperty.call(parent, last)) delete parent[last];
}
