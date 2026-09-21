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
import { normalizeTypeId } from '~/server/runtime/entities.js';
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
import { compileRegistryForOrganization } from '../cts-types/service.js';
import { ensureInstanceIndexes } from '../instances/indexes.js';
import { publishOrgContractChanged } from '../entity-events/service.js';
import { projectDomainFromView } from '~/packages/cts/src/index.js';
import { cncPackContent } from '~/packages/domain-cnc/src/index.js';
import { resolveCompiledRelationOptions } from './relation-option-resolver.js';
import {
  applyStatusMigrations,
  buildStatusMigrationPlan,
  normalizeStatusMappings,
  throwMigrationRequired,
  validateStatusMappings
} from './migration-plan.js';
import {
  assertCurrentProcessDefinition,
  currentProcessDefinition,
  tryAcceptGraphProtocol,
  validateActivatableProcess
} from './compiler-adapter.js';
import { migrateProducerOutputIdentities } from '~/packages/processes/src/index.js';
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
  const compiled = await compileActiveProcessRuntime(process.data, organization.roles, organizationId);
  const action = compiled?.actions?.[actionId];
  if (!action?.relationMutation || action.relationMutation.operation !== 'link') {
    throw createError({ statusCode: 400, message: 'Action does not provide relation options' });
  }
  assertCompiledActionAvailable(actionId, auth);
  const owner = await resolveProcessGraphEntity(action.typeId, entityId, { auth });
  return resolveCompiledRelationOptions({
    action,
    compiled,
    owner,
    source,
    auth,
    registry: getAppRegistry(),
    createExecutionAuth: createActionExecutionAuth,
    resolveEntity: (typeId, id, executionAuth) => resolveProcessGraphEntity(typeId, id, { auth: executionAuth })
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
  // Authored data persists in its own vocabulary (graph protocol v5 stays
  // v5): the persisted producer-identity rewrite runs on it, and protocol
  // acceptance (v5 lowering + binding checks) validates a copy.
  const domain = await getProjectedDomain(organizationId);
  const authored = persistedRewrites(structuredClone(payload.data || payload), domain);
  const process = new ProcessDefinition({
    identity: {
      uid: `process-${new ObjectId().toString().slice(0, 8)}`,
      name,
      slug: standardSlugify(name, { keepCase: false })
    },
    lineage: { organizationId: toFlexibleId(organizationId) },
    data: authored
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
  // Authored data persists in its own vocabulary: the persisted
  // producer-identity rewrite runs on it, and protocol acceptance validates
  // a lowered copy so an invalid draft still fails loudly.
  const domain = await getProjectedDomain(process.lineage.organizationId);
  const authored = persistedRewrites(structuredClone(payload.data || payload), domain);
  process.data = authored;
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
    const roles = await loadOrganizationRoles(process.lineage.organizationId);
    const domain = await getProjectedDomain(process.lineage.organizationId);
    const data = currentProcessDefinition(active.data, domain);
    return compileProcessDefinition(data, domain, { roles });
  } catch {
    return null;
  }
}

async function contractDiffFor(process, auth) {
  const baseline = await activeContractBaseline(process, auth);
  if (!baseline) return null;
  const roles = await loadOrganizationRoles(process.lineage.organizationId);
  try {
    return diffProcessContracts(baseline, await compileOrganizationProcess(process.data, process.lineage.organizationId, roles));
  } catch {
    return null;
  }
}

// Activation must not silently orphan live entities on workflow states the
// next contract removes. The gate now doubles as the Apply migration plan
// generator (canonical contract in this feature's README): live counts per
// removed state become plan rows, and a confirmed mapping payload re-targets
// the affected instances right after the new contract is active. Entity
// types whose status check cannot run are not treated as affected.
async function collectStrandedEntityStatuses(process, auth, nextCompiled) {
  const baseline = await activeContractBaseline(process, auth);
  if (!baseline) return [];
  const removed = diffProcessContracts(baseline, nextCompiled).removedEntityStatuses;
  const stranded = [];
  for (const { typeId, statuses } of removed) {
    let entities = [];
    try {
      entities = await queryProcessGraphEntities(typeId, {}, auth);
    } catch {
      continue;
    }
    const counts = Object.fromEntries(statuses.map(state => [state, 0]));
    for (const entity of entities) {
      const primary = entity?.status?.state?.primary;
      if (Object.hasOwn(counts, primary)) counts[primary] += 1;
    }
    const present = statuses.filter(state => counts[state] > 0)
      .map(state => ({ state, count: counts[state] }));
    if (present.length) stranded.push({ typeId, statuses: present });
  }
  return stranded;
}

export async function validate(id, auth) {
  const process = await loadAuthorized(id, auth, 'write');
  const domain = await getProjectedDomain(process.lineage.organizationId);
  const accepted = currentProcessDefinition(process.data, domain);
  assertCanonicalProcessSource(accepted);
  const validation = validateActivatableProcess(accepted, domain, await loadOrganizationRoles(process.lineage.organizationId));
  const diff = await contractDiffFor(process, auth);
  let migrationPlan = null;
  if (diff?.removedEntityStatuses?.length) {
    try {
      const nextCompiled = await compileOrganizationProcess(process.data, process.lineage.organizationId, await loadOrganizationRoles(process.lineage.organizationId));
      const stranded = await collectStrandedEntityStatuses(process, auth, nextCompiled);
      if (stranded.length) migrationPlan = buildStatusMigrationPlan(stranded, nextCompiled);
    } catch {
      // The activate boundary recomputes the plan from fresh compiles; a
      // failed plan build here must not mask the validation result.
    }
  }
  return { ...validation, diff, ...(migrationPlan ? { migrationPlan } : {}) };
}

export async function activate(id, auth, payload = {}) {
  const process = await loadAuthorized(id, auth, 'admin');
  const domain = await getProjectedDomain(process.lineage.organizationId);
  const accepted = currentProcessDefinition(process.data, domain);
  assertCanonicalProcessSource(accepted);
  const roles = await loadOrganizationRoles(process.lineage.organizationId);
  const validation = validateActivatableProcess(accepted, domain, roles);
  if (!validation.ok) {
    throw createError({ statusCode: 400, message: validation.errors.join('; '), data: validation });
  }
  const roundTrip = validateRoundTrip(accepted);
  if (!roundTrip.ok) {
    throw createError({ statusCode: 400, message: roundTrip.errors.join('; '), data: roundTrip });
  }
  process.data = {
    ...process.data,
    compiled: await compileOrganizationProcess(process.data, process.lineage.organizationId, roles)
  };
  const stranded = await collectStrandedEntityStatuses(process, auth, process.data.compiled);
  const plan = stranded.length ? buildStatusMigrationPlan(stranded, process.data.compiled) : null;
  const mappings = normalizeStatusMappings(payload?.migration?.statuses);
  if (stranded.length) {
    if (!mappings.length) throwMigrationRequired(stranded, plan);
    const mappingErrors = validateStatusMappings(plan, mappings);
    if (mappingErrors.length) {
      throw createError({ statusCode: 400, message: mappingErrors.join('; '), data: { migrationPlan: plan } });
    }
  }
  await repository.archiveActiveByOrganization(process.lineage.organizationId, auth.userId);
  applyProcessStatus(process, 'ACTIVE', auth.userId, 'Process activated');
  let updated = await repository.updateById(id, process);
  await organizationProcessService().setActiveProcessDefinition(process.lineage.organizationId, updated._id);
  // Activation can flip the org's registry view (APPLY posts in-tree
  // declarations before activate): re-derive the instance indexes.
  await ensureInstanceIndexes((await compileRegistryForOrganization(process.lineage.organizationId)).resolveView(process.lineage.organizationId));
  publishOrgContractChanged(String(process.lineage.organizationId), 'process', { definitionId: String(updated._id) });
  if (stranded.length) {
    // Activate, then migrate (one request): the status machine resolves the
    // active contract, so target states only exist after activation. Writes
    // are initial-state re-targets; every step is idempotent and publishes
    // the shared invalidation event.
    const migration = await applyStatusMigrations({
      mappings,
      auth,
      organizationId: process.lineage.organizationId,
      compiled: process.data.compiled
    });
    process.data.migration = {
      appliedAt: new Date().toISOString(),
      actor: auth.userId || 'SYSTEM',
      mappings,
      applied: migration.applied,
      failures: migration.failures
    };
    updated = await repository.updateById(id, process);
    if (migration.failures.length) {
      throw createError({
        statusCode: 500,
        message: `Migration incomplete: ${migration.failures.length} instance(s) failed to re-target. Re-apply with the same mappings to resume.`,
        data: { migrationIncomplete: true, migration: process.data.migration, migrationPlan: plan }
      });
    }
  }
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
    compiled: await compileOrganizationProcess(process.data, process.lineage.organizationId, roles)
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
  // Protocol acceptance at the execution boundary: a v5 definition lowers
  // here once, so the run's stored snapshot and every downstream evaluation
  // see the executable working shapes.
  const runnableDefinition = {
    ...definition,
    data: currentProcessDefinition(definition.data, await getProjectedDomain(resolveOrganizationId(auth)))
  };
  const organizationId = resolveOrganizationId(auth);
  const actor = buildRunActor(auth, organizationId);
  const runRepository = options.runRepository || getRunRepository(await repository.getConnection());
  return serializeProcessResult(await executeManualRun(runnableDefinition, payload, {
    actor,
    repository: runRepository,
    ...manualRunEnvironment(runnableDefinition, auth)
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
      fieldSchema: structural ? getBlockFieldSchema(record.path) : getEntityFieldSchema(record.typeId, record.path),
      fieldSchemas: structural ? getBlockFieldSchemas(record.block) : getEntityFieldSchemas(record.typeId),
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
  // Preview receives client-authored definitions: protocol acceptance runs
  // here too, so a v5 draft previews against the same lowered shapes the
  // compiler and runtime would use.
  const previewDefinition = {
    ...definition,
    data: currentProcessDefinition(definition.data || definition, await getProjectedDomain(organizationId))
  };
  const run = { context: { inputs }, trigger };
  // Preview results cross the HTTP boundary, so the missing-field markers
  // produced by the evaluator are converted to their serializable tag here —
  // the single emission conversion point shared with any runtime result
  // emission (see packages/processes/src/missing-field.js).
  return serializeProcessResult(await previewProcessDataflow(previewDefinition, { trigger, inputs }, {
    targetNodeId: nodeId,
    previewLimit: 100,
    domain: getDomain(),
    catalogContext: record => {
      const structural = ['record.getField', 'record.composeBlock', 'record.modifyBlock'].includes(record.kind);
      return {
        fieldSchema: structural ? getBlockFieldSchema(record.path) : getEntityFieldSchema(record.typeId, record.path),
        fieldSchemas: structural ? getBlockFieldSchemas(record.block) : getEntityFieldSchemas(record.typeId),
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
  const service = registry.getEntityService(socket.typeId);
  if (!service?.processGetById) throw createError({ statusCode: 500, message: `Entity service cannot read ${socket.typeId} from a process` });
  const entity = await service.processGetById(entityId, auth);
  if (!entity) throw createError({ statusCode: 404, message: `${socket.typeId} not found` });

  const domainEntity = (getDomain().entities || []).find(item => item.type === socket.typeId);
  assertEntityAccess({
    entity,
    typeId: socket.typeId,
    feature: socket.feature || domainEntity?.collection || `${socket.typeId}s`,
    level: 'read',
    auth
  });

  return {
    socketId,
    typeId: socket.typeId,
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
  const compiled = await compileActiveProcessRuntime(process.data, organization.roles, organizationId);
  const action = compiled?.actions?.[actionId];
  if (!action) throw createError({ statusCode: 404, message: 'Action not found in active process' });
  assertCompiledActionAvailable(actionId, auth);
  if (action.relationMutation) {
    if (data?.relationCreator) {
      const creatorId = action.relationMutation.creator?.actionId;
      const creatorAction = creatorId && compiled.actions?.[creatorId];
      if (!creatorAction || creatorAction.typeId !== action.relationMutation.targetType) {
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
      if (!createdId) throw createError({ statusCode: 500, message: `Created ${creatorAction.typeId} has no id` });
      const owner = await executeCompiledRelationMutationAction({
        action,
        actionId,
        entityId,
        data: {
          relations: { [action.relationMutation.key]: { type: creatorAction.typeId, id: createdId } },
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
  const targetValue = entityId || entities?.entity || entities?.[action.typeId];
  const targetId = normalizeEntityRef(targetValue)?.id || targetValue;
  if (!targetId) throw createError({ statusCode: 400, message: 'Entity id is required' });
  const typeId = resolveActionTypeId(action);
  const executionAuth = createActionExecutionAuth(auth, action);
  const selectedMutation = pickMutationData(data, action, entities);
  if (data.relationReplaces) selectedMutation.relationReplaces = data.relationReplaces;
  const mutation = await resolveManualRelationMutation(
    typeId,
    targetId,
    selectedMutation,
    action,
    executionAuth
  );
  const updated = await persistProcessEntityPatch(typeId, targetId, flattenMutationPatch(mutation), executionAuth);
  await publishActionEntityEvent(auth, typeId, updated || { _id: targetId }, 'updated', 'process-relation-update');
  return updated;
}

async function resolveManualRelationMutation(typeId, targetId, mutation = {}, action = {}, auth = {}) {
  const contract = action.relationMutation;
  const key = contract?.key;
  const targetValue = getByPath(mutation, `relations.${key}`);
  const targetRef = normalizeRelationRef(targetValue, contract?.targetType);
  await assertRelationTargetAvailable(targetRef, contract, auth);
  const replacementRef = mutation.relationReplaces
    ? normalizeRelationRef(mutation.relationReplaces, contract?.targetType)
    : null;

  const service = getAppRegistry().getEntityService(typeId);
  const currentRecord = await service?.processGetById?.(targetId, auth);
  if (!currentRecord) throw createError({ statusCode: 404, message: `${typeId} not found` });
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
            typeId: targetRef.type,
            id: targetRef.id
          }
        ];
    setByPath(result, associationPath, nextAssociations);
  }
  return result;
}

async function executeDataflowActionRun({ process, actionId, entityId, data, parameters, entities, targetOrganizationId }, auth) {
  const effect = Object.values(process.data.processNodes || {})
    .find(node => node.id === actionId && (node.kind?.startsWith('effect.') || node.kind?.startsWith('cts.')));
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

export async function resolveProcessGraphEntity(typeId, candidate, { entityId = null, entities = {}, auth = {} } = {}) {
  if (candidate && typeof candidate === 'object' && !Array.isArray(candidate) && !normalizeEntityRef(candidate)) {
    return candidate;
  }
  const supplied = candidate ?? entities?.[typeId] ?? entities?.entity ?? entityId;
  const ref = normalizeEntityRef(supplied);
  const id = ref?.id || (typeof supplied === 'string' ? supplied : null);
  if (!id) throw new Error(`No ${typeId} entity was supplied to the process graph`);
  const service = getAppRegistry().getEntityService(typeId);
  if (!service?.processGetById) throw new Error(`Entity service cannot read ${typeId} from a process`);
  const entity = await service.processGetById(id, auth);
  if (!entity) throw new Error(`${typeId} ${id} was not found`);
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

async function queryProcessGraphEntities(typeId, filters = {}, auth = {}) {
  const service = getAppRegistry().getEntityService(typeId);
  if (!service?.processList) throw new Error(`Entity service cannot query ${typeId} from a process`);
  const entities = await service.processList(filters, auth);
  return (entities || []).map(entity => entity?.toJSON ? entity.toJSON() : entity);
}

async function linkCreatedEntityToContextRelation({ action = {}, data = {}, entities = {}, created = null, auth = {} } = {}) {
  const link = data?.linkCreatedTo;
  if (!link || typeof link !== 'object') return null;
  const ownerType = normalizeTypeId(link.ownerType || '');
  const targetType = resolveActionTypeId(action);
  const relation = (getDomain().relations || []).find(item => (
    normalizeTypeId(item.ownerType) === ownerType
    && item.key === link.relationKey
    && normalizeTypeId(item.targetType) === targetType
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
          typeId: targetType,
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
  const statusesByTypeId = commandOutputStatusMap(actionId, processData);
  if (!statusesByTypeId.size) return;
  for (const entityRef of result.entities || []) {
    const typeId = normalizeTypeId(entityRef.type || entityRef.typeId || '');
    const statusTargets = statusesByTypeId.get(typeId) || [];
    if (statusTargets.length > 1) {
      throw new Error(`Process command action ${actionId} has ambiguous status outputs for ${typeId}`);
    }
    const statusTarget = statusTargets[0];
    const targetState = statusTarget?.targetState;
    const targetId = entityRef.id || entityRef._id;
    if (!typeId || !targetState || !targetId) continue;
    await statusService.setInitialStateForOrganization(
      typeId,
      targetId,
      targetState,
      organizationId,
      auth.userId,
      processStatusMetadata({
        typeId,
        producerOutputId: statusTarget.producerOutputId,
        status: { to: targetState }
      }, `Created by process command action ${actionId}`, processData)
    );
    await entityEventService.publishEntityChanged(auth, {
      type: typeId,
      id: targetId,
      change: 'updated',
      reason: 'process-command-output-status'
    });
  }
}

async function publishStatusResultEvents(auth, typeId, targetId, result = {}, reason = 'process-status-action') {
  await entityEventService.publishEntityChanged(auth, {
    type: typeId,
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

async function publishActionEntityEvent(auth, typeId, entity, change, reason) {
  await entityEventService.publishEntityChanged(auth, {
    type: typeId,
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
    const typeId = normalizeTypeId(
      targetAction.typeId
      || targetAction.inputs?.find(input => input.typeId)?.typeId
      || String(edge.sourceHandle || '').replace(/^output:/, '')
    );
    const targetState = targetAction.status?.to || targetAction.access?.statusTo;
    if (typeId && targetState) {
      const targets = map.get(typeId) || [];
      targets.push({ targetState, producerOutputId: targetAction.producerOutputId || null });
      map.set(typeId, targets);
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
  // The assignment manifest carries full action records keyed `id`; the
  // lean exposure shape used `actionId`. Both identify the same action.
  if (!available.some(action => (action.actionId ?? action.id) === actionId)) {
    throw createError({ statusCode: 403, message: `Action ${actionId} is not available to the current process role` });
  }
}

function resolveActionTypeId(action = {}) {
  return normalizeTypeId(action.typeId || action.inputs?.find(input => input.typeId)?.typeId || '');
}

function getEntityServiceForAction(action = {}) {
  const typeId = resolveActionTypeId(action);
  if (!typeId) throw createError({ statusCode: 400, message: `Action ${action.id} has no entity type` });
  const service = getAppRegistry().getEntityService(typeId);
  if (!service) throw createError({ statusCode: 500, message: `Entity service missing for ${typeId}` });
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
  if (action.parentTypeId) {
    sources.push({ typeId: action.parentTypeId, level: 'read', actions: { view: true } });
  }
  if (action.construction?.mode === 'bakeCassetteDesignFromTemplate') {
    sources.push({ typeId: 'cassette', level: 'read', actions: { view: true } });
  }
  if (action.construction?.mode === 'importCassetteDesignFromArtifact') {
    sources.push({ typeId: 'artifact', level: 'read', actions: { view: true } });
  }
  for (const field of [
    ...(action.construction?.inputs || []),
    ...(action.inputPolicy?.fields || []),
    ...(action.inputs || [])
  ]) {
    if (field?.typeId && (field.type === 'entity' || field.kind === 'entity' || field.relationKey || field.id === 'parent')) {
      sources.push({ typeId: field.typeId, level: field.access?.level || 'read', actions: { view: true } });
    }
  }
  const seen = new Set();
  return sources.flatMap(source => {
    const feature = resolveEntityFeature(source.typeId);
    const key = `${feature}:${source.level}`;
    if (!feature || seen.has(key)) return [];
    seen.add(key);
    return [{ ...source, feature }];
  });
}

function resolveActionFeature(action = {}) {
  return resolveEntityFeature(resolveActionTypeId(action));
}

function resolveEntityFeature(typeId = '') {
  typeId = normalizeTypeId(typeId);
  const domain = getDomain();
  const entity = (domain?.entities || []).find(item => item.type === typeId);
  const fieldPolicy = getEntityFieldAccessPolicy(typeId) || domain?.fieldAccess?.[typeId];
  if (fieldPolicy?.feature) return fieldPolicy.feature;
  if (entity?.feature) return entity.feature;
  if (entity?.collection) return entity.collection;
  return typeId;
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

async function normalizeProcessMutation(typeId, mutation = {}, relationContracts = [], auth = {}) {
  if (!mutation.relations) return mutation;
  const normalizedRelations = {};
  for (const [key, value] of Object.entries(mutation.relations)) {
    const relation = relationContracts.find(item => (
      normalizeTypeId(item.ownerType) === normalizeTypeId(typeId) && item.key === key
    ));
    if (!relation) {
      throw createError({ statusCode: 400, message: `Action cannot write undeclared relation ${typeId}.${key}` });
    }
    const values = Array.isArray(value) ? value : [value];
    const refs = [];
    for (const item of values) {
      const ref = normalizeRelationRef(item, relation.targetType);
      await assertRelationTargetAvailable(ref, relation, auth);
      refs.push(ref);
    }
    if (relation.cardinality === 'one' && refs.length !== 1) {
      throw createError({ statusCode: 400, message: `Relation ${typeId}.${key} accepts exactly one entity` });
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

async function normalizeProcessPatchRelations(typeId, patch = {}, contracts = [], auth = {}) {
  const relations = Object.fromEntries(contracts.flatMap(contract => (
    Object.hasOwn(patch, `relations.${contract.key}`)
      ? [[contract.key, patch[`relations.${contract.key}`]]]
      : []
  )));
  if (!Object.keys(relations).length) return patch;
  const normalized = await normalizeProcessMutation(typeId, { relations }, contracts, auth);
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
  const definition = (getDomain().entities || []).find(item => normalizeTypeId(item.type) === normalizeTypeId(relation.targetType));
  assertEntityAccess({
    entity,
    typeId: relation.targetType,
    feature: resolveEntityFeature(definition?.type || relation.targetType),
    level: 'read',
    action: 'view',
    auth
  });
  if (!ref.revisionId) return;
  const revision = await entityRevisionsService.getById(ref.revisionId, auth.userId, auth.role, auth);
  const source = revision?.data?.source;
  if (normalizeTypeId(source?.type) !== normalizeTypeId(relation.targetType) || String(source?.id) !== String(ref.id)) {
    throw createError({ statusCode: 400, message: `Pinned revision does not belong to ${relation.targetType} ${ref.id}` });
  }
}

function normalizeRelationRef(value, targetType) {
  const ref = normalizeEntityRef(typeof value === 'object' ? value : { type: targetType, id: value });
  if (!ref || normalizeTypeId(ref.type) !== normalizeTypeId(targetType)) {
    throw createError({ statusCode: 400, message: `Relation target must be ${targetType}` });
  }
  return { ...ref, type: targetType };
}

async function persistProcessEntityPatch(typeId, targetId, patch, auth) {
  const service = getAppRegistry().getEntityService(typeId);
  if (!service?.processGetById || !service?.processUpdate) {
    throw createError({ statusCode: 500, message: `Entity service cannot persist process updates for ${typeId}` });
  }
  const entityResult = await service.processGetById(targetId, auth);
  const entity = entityResult?.toJSON ? entityResult.toJSON() : entityResult;
  if (!entity) throw createError({ statusCode: 404, message: `${typeId} not found` });
  assertEntityAccess({
    entity,
    typeId,
    feature: resolveEntityFeature(typeId),
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
  const resolveEntity = (typeId, idOrRef) => resolveProcessGraphEntity(typeId, idOrRef, { auth });
  const queryEntities = (typeId, filters) => queryProcessGraphEntities(typeId, filters, auth);
  return {
    currentEntity: async typeId => {
      const candidate = run.context?.inputs?.entities?.[typeId] || run.context?.inputs?.entity;
      return candidate ? resolveProcessGraphEntity(typeId, candidate, { auth }) : null;
    },
    entityById: (typeId, id) => resolveProcessGraphEntity(typeId, id, { auth }),
    resolveEntityRef: ref => resolveProcessGraphEntity(ref.type, ref, { auth }),
    parentEntity: (entity, typeId) => processParentEntity(domain.containment, resolveEntity, entity, typeId),
    childEntities: (entity, typeId) => processChildEntities(domain.containment, queryEntities, entity, typeId),
    relatedEntities: (entity, relationKey, typeId) => processRelatedEntities(domain.relations, resolveEntity, entity, relationKey, typeId),
    queryEntities: async (typeId, predicate) => {
      const service = getAppRegistry().getEntityService(typeId);
      if (!service?.processList) throw new Error(`Entity service cannot query ${typeId} from a process`);
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
  const typeId = normalizeTypeId(record.typeId || inputs.entity?.type || '');
  if (!typeId) throw new Error(`${kind} requires typeId`);
  const service = getAppRegistry().getEntityService(typeId);
  if (!service) throw new Error(`Entity service missing for ${typeId}`);
  const requiredCapability = {
    'effect.archiveEntity': 'archive',
    'effect.deleteEntity': 'delete'
  }[kind];
  if (requiredCapability && service.processCapabilities?.[requiredCapability] !== true) {
    throw new Error(`${typeId} does not support process ${requiredCapability}`);
  }
  if (kind === 'effect.deleteEntity' && !getDomain().entities?.find(entity => entity.type === typeId)?.operations?.delete) {
    throw new Error(`${typeId} does not declare hard deletion`);
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
    blockDraft = await normalizeProcessMutation(typeId, blockDraft, relationContracts, executionAuth);
    const targetState = inputs['status.state.primary'] || record.status?.to;
    const draft = {
      ...blockDraft,
      ...constructionDraft,
      // §3/§8 causal record: the effect boundary stamps provenance on
      // every process-constructed instance — op names the node and its
      // construction mode, sources collect the typed entity inputs plus
      // the run-context entity, effective carries the resolved parameters
      // (the conversion's replay-safety inputs).
      provenance: constructProvenance(record, constructionDraft, targetState, inputs)
    };
    const statusMetadata = draft.status?.metadata && typeof draft.status.metadata === 'object'
      ? draft.status.metadata
      : {};
    delete draft.status;
    const mode = record.construction?.mode || '';
    const handler = service.constructionHandlers?.[mode];
    if (typeof handler !== 'function') {
      throw new Error(`No registered handler for construction mode ${mode || '(none)'} on ${typeId}`);
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
            typeId,
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
    await publishActionEntityEvent(auth, typeId, result, 'created', 'process-create');
    return result;
  }
  const target = normalizeEntityRef(inputs.entity);
  if (!target?.id) throw new Error(`${kind} requires an entity reference`);
  if (kind === 'effect.updateEntity') {
    // Field schemas resolve against the projected view first — org/pack
    // types live there; legacy types not in the view keep the legacy
    // tables until their surfaces are deleted.
    const projectedFieldSchemas = (await getProjectedDomain(resolveOrganizationId(auth)))
      .fieldSchemas?.[typeId];
    const schemas = projectedFieldSchemas || getEntityFieldSchemas(record.typeId);
    const persistedChanges = processBlockInputChanges(record, inputs, schemas);
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
      patch = await normalizeProcessPatchRelations(typeId, patch, relationContracts, auth);
      const result = await statusService.transitionWithResult({
        typeId,
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
      const current = await resolveProcessGraphEntity(typeId, target, { auth });
      const changeSet = { typeId, changes: persistedChanges };
      const updated = applyPatch(current, changeSet);
      patch = Object.fromEntries(persistedChanges.map(change => {
        const value = getByPath(updated, change.path);
        if (value === undefined) throw new Error(`Persisted entity updates cannot unset ${change.path}`);
        return [change.path, value];
      }));
    }
    Object.assign(patch, Object.fromEntries(Object.entries(declaredRelationValues(inputs.relations, relationContracts))
      .map(([key, value]) => [`relations.${key}`, value])));
    patch = await normalizeProcessPatchRelations(typeId, patch, relationContracts, auth);
    if (!service.processUpdate) throw new Error(`Entity service cannot update ${typeId}`);
    return await service.processUpdate(target.id, patch, auth);
  }
  if (kind === 'effect.changeStatus') {
    const patch = Object.fromEntries((inputs.changes?.changes || []).map(change => {
      if ((change.operation || 'set') !== 'set') throw new Error(`Status transition patch does not support ${change.operation}`);
      return [change.path, change.value];
    }));
    const result = await statusService.transitionWithResult({
      typeId,
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
      typeId,
      targetId: target.id,
      ...(record.archiveIntent ? { intent: record.archiveIntent } : { targetState: 'ARCHIVED' }),
      auth,
      context: effectTransitionContext(record, inputs)
    });
    return result.entity;
  }
  if (kind === 'effect.deleteEntity') {
    if (!service.processDelete) throw new Error(`Entity service cannot delete ${typeId}`);
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
      entities: { [typeId]: target },
      parameters: inputs.parameters || {}
    }, auth);
  }
  throw new Error(`Unsupported process effect ${kind}`);
}

function effectTransitionContext(record = {}, inputs = {}) {
  const note = inputs.note ?? record.note;
  return {
    source: 'process-run',
    ...(record.producerOutputId ? { producerOutputId: record.producerOutputId } : {}),
    ...(note != null && note !== '' ? { metadata: { note: String(note) } } : {})
  };
}

async function applyTypedConstructionBlocks(record = {}, blockDraft = {}, created = null, service = null, auth = {}) {
  if (!created || !Object.keys(blockDraft).length) return created;
  if (!service?.processUpdate) throw new Error(`Entity service cannot apply constructed blocks to ${record.typeId}`);
  const targetId = created._id || created.identity?.uid;
  if (!targetId) throw new Error(`Created ${record.typeId} has no id`);
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
  const schemas = getEntityFieldSchemas(record.typeId);
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

// Provenance stamp for the generic construct boundary (SPEC §3/§8).
export function constructProvenance(record = {}, constructionDraft = {}, targetState = null, inputs = {}) {
  const mode = record.construction?.mode || '';
  const sources = [];
  const seen = new Set();
  const addSource = (type, id) => {
    if (!id) return;
    const key = `${type || ''}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    sources.push({ ...(type ? { type } : {}), id: String(id) });
  };
  for (const input of record.construction?.inputs || []) {
    if (input.type !== 'entity' && input.type !== 'typeList') continue;
    const supplied = Object.hasOwn(inputs, input.id || input.path) ? inputs[input.id || input.path] : input.default;
    const values = input.type === 'typeList'
      ? (Array.isArray(supplied) ? supplied : [supplied])
      : [supplied];
    for (const value of values) {
      const ref = normalizeEntityRef(value) || (value?.id || value?._id ? { type: input.typeId, id: value.id || value._id } : null);
      if (ref) addSource(ref.type || input.typeId, ref.id);
    }
  }
  const contextRef = normalizeEntityRef(inputs.entity || null);
  if (contextRef) addSource(contextRef.type, contextRef.id);
  const effective = { via: mode || 'genericCreate' };
  if (targetState) effective.targetState = targetState;
  const parameters = Object.fromEntries(Object.entries(constructionDraft || {})
    .filter(([, value]) => value !== undefined && value !== null));
  if (Object.keys(parameters).length) effective.parameters = parameters;
  return {
    op: `${record.kind || 'effect.createEntity'}:${record.id}${mode ? `:${mode}` : ''}`,
    sources,
    effective
  };
}

export function processConstructionInputRecord(record = {}, inputs = {}) {
  const result = {};
  for (const input of record.construction?.inputs || []) {
    const id = input.id || input.path;
    if (!id) continue;
    const supplied = Object.hasOwn(inputs, id) ? inputs[id] : input.default;
    if (supplied === undefined) continue;
    const value = input.type === 'entity'
      ? entityInputId(supplied)
      : input.type === 'typeList'
        ? (Array.isArray(supplied) ? supplied : [supplied]).map(entityInputId).filter(Boolean)
        : supplied;
    // The identity 'name' construction input writes the wire identity
    // block — the §3 instance boundary reads draft.identity.name, and a
    // top-level `name` key would silently drop (fields landed, names
    // did not).
    if (id === 'name' || input.path === 'name') {
      setByPath(result, 'identity.name', value);
      continue;
    }
    setByPath(result, input.path || id, value);
  }
  return result;
}

function processBlockInputChanges(record = {}, inputs = {}, schemas = null) {
  const fieldSchemas = schemas || getEntityFieldSchemas(record.typeId);
  const changes = [];
  // v5 leaf field inputs arrive keyed by their full schema path (the
  // cts.mutate field sockets): a wired or prompted leaf writes exactly
  // that field, no block composition required.
  const leafPaths = new Set();
  for (const field of fieldSchemas) {
    if (field.writable === false || !Object.hasOwn(inputs, field.path)) continue;
    leafPaths.add(field.path);
    changes.push({
      path: field.path,
      operation: 'set',
      value: normalizeBlockFieldValue(field, inputs[field.path])
    });
  }
  for (const block of record.blocks || []) {
    if (!Object.hasOwn(inputs, block)) continue;
    const value = inputs[block];
    for (const field of fieldSchemas.filter(item => item.block === block && item.writable !== false)) {
      if (leafPaths.has(field.path)) continue;
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
      typeId: 'organization',
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

// The compiler consumes the CTS-projected domain: strangler-converted system
// declarations plus the organization's authored types (cts_types). A broken
// stored type fails loudly here rather than silently compiling without it.
async function getProjectedDomain(organizationId = null) {
  const registry = await compileRegistryForOrganization(organizationId);
  return projectDomainFromView(registry, organizationId, getDomain(), {
    packServices: cncPackContent.services
  });
}

// The rewrites that PERSIST: producer-identity migration applies to the
// authored data itself (pre-protocol records only; cts records carry their
// identities from the designer). Protocol acceptance runs on a lowered copy
// and never mutates what is stored.
function persistedRewrites(data, domain) {
  const migration = migrateProducerOutputIdentities(data, domain);
  if (migration.errors.length) {
    throw createError({ statusCode: 400, message: migration.errors.join('; '), data: { errors: migration.errors } });
  }
  assertCurrentProcessDefinition(migration.data);
  // Binding diagnostics stay authored at the save boundary; validate/apply
  // own the report, so a draft with access rules on a still-unbound node
  // remains savable.
  tryAcceptGraphProtocol(migration.data, domain);
  return migration.data;
}

// One compile path: protocol acceptance (v5 lowering) through
// currentProcessDefinition, then the process compiler on the projected
// domain.
async function compileOrganizationProcess(data, organizationId, roles) {
  const domain = await getProjectedDomain(organizationId);
  return compileProcessDefinition(currentProcessDefinition(data, domain), domain, { roles });
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
