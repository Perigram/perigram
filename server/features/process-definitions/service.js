import { createError } from 'h3';
import standardSlugify from 'standard-slugify';
import { ObjectId } from 'mongodb';
import { normalizeInstanceRef } from '#packages/core';
import { assertEntityAccess } from '~/server/core/access/service.js';
import { executeCommand } from '~/server/core/commands/service.js';
import { createStatusState } from '~/server/core/blocks/index.js';
import { stateService } from '~/server/core/machines/service.js';
import * as workflowOverridesService from '../workflow-overrides/service.js';
import * as instanceRevisionsService from '~/server/features/instance-revisions/service.js';
import * as entityEventService from '~/server/features/instance-events/service.js';
import { exportersForOrganization, invokePreviewValueService } from '../plugins/service.js';
import { declarationForType, writeGrantTarget } from '../instances/service.js';
import { normalizeTypeId } from '~/server/runtime/entities.js';
import { getEntityFieldAccessPolicy } from '~/shared/field-access-policies.js';
import {
  compileProcessDefinition,
  authoredProcessDataFromGraphDocument,
  createProcessGraphDocument,
  constructionInputsForContract,
  diffProcessContracts,
  hasCanonicalProcessSource,
  normalizeProcessDefinition,
  migrateProducerOutputIdentities,
  PROCESS_DATAFLOW_VERSION,
  PROCESS_GRAPH_ACTIVATION_FIELDS,
  PROCESS_GRAPH_METADATA_KEY,
  previewProcessDataflow,
  resolveConstructionMode,
  resumeProcessRun,
  serializeProcessResult,
  transitionProcessRun,
  transitionProcessStep,
  validateRoundTrip,
  authoredSocketDefault,
  isDataTree,
  packetValue
} from '#packages/processes';
import { createDefinitionAuthoring, collapseEffectAccessGrants, emptyAuthoredDocument, graphEdgeSocketProblems, graphIntegrityProblems } from '#packages/processes/authoring';
import {
  processStatusMetadata
} from './status-metadata.js';
import { createActionExecutionAuthHelpers } from './action-execution-auth.js';

import { persistRun, persistEvent, markEventDispatched } from './run-store.js';
import {
  getBlockFieldSchema,
  getBlockFieldSchemas,
  getEntityFieldSchema,
  getEntityFieldSchemas
} from './system-view.js';
import { getAppRegistry } from '~/server/runtime/app-registry.js';
import { toFlexibleId } from '~/server/utils/objectid.js';
import { resolveOrganizationId } from '~/server/utils/organization-scope.js';
import { hasPermissionGrant } from '#shared/access-control.js';
import { ProcessDefinition } from './model.js';
import * as usersService from '../users/service.js';
import * as repository from './repository.js';
import { compileActiveProcessRuntime, getActiveMergedDataForOrganization, resolveProcessAuth } from './runtime.js';
import { compileRegistryForOrganization, defineType } from '../cts-types/service.js';
import { ensureInstanceIndexes } from '../instances/indexes.js';
import { publishOrgContractChanged } from '../instance-events/service.js';
import { operationKindOf, projectDomainFromView, orientChildrenEdgesChildFirst, rewriteRetiredWirePaths, retireStateScopeAuthoring } from '#packages/cts';
import { withinRelationDomain } from '#shared/relation-domain.js';
import { projectedDomainsForOrganization, projectedServicesForOrganization, starterConstructsForOrganization, resolveProjectionValue } from '~/server/features/plugins/service.js';
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
  declarationOverlayDomain,
  mergeActiveDefinitions,
  tryAcceptGraphProtocol,
  validateActivatableProcess
} from './compiler-adapter.js';
import { compileTreeDeclarations, createProcessRun, advanceProcessRun } from '#packages/processes';
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
  // activations accumulated; full data loads per id on selection. The
  // `states.main` field stays: the designer's initial-pick ranks
  // ACTIVE/DRAFT/ARCHIVED on it, and without it a draft-only organization
  // falls through to whichever summary sorts first (an archived empty
  // process beat the real draft).
  return raws.map(raw => ({
    _id: raw._id,
    identity: raw.identity ? { ...raw.identity } : {},
    status: raw.status ? structuredClone(raw.status) : {},
    lineage: raw.lineage ? { ...raw.lineage } : {},
    states: raw.states ? { ...raw.states } : {}
  }));
}

/**
 * Picker data over the active set's compiled machines: one row per
 * emitted type with its primary-region state paths. Scan-input law
 * (deadline scanner): this reads activation-written `data.compiled`
 * snapshots only — auth decisions always recompile. Consumers: agent
 * bot wake-rule pickers.
 */
export async function listActiveWorkflowStates(auth) {
  const organizationId = resolveOrganizationId(auth);
  await assertOrgAccess(auth, organizationId, 'read');
  const actives = await repository.findActiveSetByOrganization(organizationId);
  const byType = new Map();
  for (const active of actives) {
    for (const output of Object.values(active.data?.compiled?.producerOutputs || {})) {
      const workflow = output?.workflow;
      if (!workflow?.regions || !output.typeId) continue;
      const region = workflow.regions[workflow.primaryRegion || 'main'];
      const states = Object.keys(region?.states || {});
      if (!states.length) continue;
      byType.set(output.typeId, [...new Set([...(byType.get(output.typeId) || []), ...states])]);
    }
  }
  return [...byType.entries()].map(([typeId, states]) => ({ typeId, states }));
}

export async function findRoleReferences(organizationId, roleId) {  const raws = await repository.find({ 'lineage.organizationId': toFlexibleId(organizationId) });
  return raws
    .filter(raw => raw.states?.main !== 'ARCHIVED')
    .filter(raw => definitionReferencesRole(raw.data || {}, roleId))
    .map(raw => ({ id: String(raw._id), name: raw.identity?.name || '', status: raw.states?.main || '' }));
}

// Blast-radius probe for type authoring (crystallization Phase 3): the
// org's non-archived process definitions whose graph or screens bind a
// CTS type. Structural match only — nodes, screens, and draft
// declaration children edges.
export async function findTypeReferences(organizationId, typeId) {
  const raws = await repository.find({ 'lineage.organizationId': toFlexibleId(organizationId) });
  return raws
    .filter(raw => raw.states?.main !== 'ARCHIVED')
    .filter(raw => definitionReferencesType(raw.data || {}, typeId))
    .map(raw => ({ id: String(raw._id), name: raw.identity?.name || '', status: raw.states?.main || '' }));
}

function definitionReferencesType(input = {}, typeId) {
  const data = authoredProcessData(input);
  if (Object.values(data.processNodes || {}).some(node => node?.typeId === typeId)) return true;
  if (Object.values(data.screens || {}).some(screen => screen?.typeId === typeId)) return true;
  return Object.values(data.ctsTypes || {})
    .some(decl => Object.values(decl?.edges?.children || {})
      .some(edge => (edge?.types || []).includes(typeId)));
}

function definitionReferencesRole(input = {}, roleId) {
  const data = authoredProcessData(input);
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

// The active-set working definition every active-runtime seam (relation
// options, socket projection, action execution) resolves against: the
// merged data of the whole active set, carried on the newest active
// definition's document shell for provenance.
async function loadActiveSetProcess(auth) {
  const organizationId = resolveOrganizationId(auth);
  const raw = await repository.findActiveByOrganization(organizationId);
  if (!raw) throw createError({ statusCode: 404, message: 'Active process definition not found' });
  const data = await getActiveMergedDataForOrganization(organizationId);
  return new ProcessDefinition({ ...raw, data: data || raw.data });
}

export async function getActive(auth) {
  const organizationId = resolveOrganizationId(auth);
  await assertOrgAccess(auth, organizationId, 'read');
  const raw = await repository.findActiveByOrganization(organizationId);
  return raw ? new ProcessDefinition(raw).toJSON() : null;
}

export async function getActiveRelationOptions({ actionId, instanceId, source = false } = {}, auth = {}) {
  const process = await loadActiveSetProcess(auth);
  const organizationId = resolveOrganizationId(auth);
  const organization = await loadOrganizationProcessConfiguration(organizationId);
  const compiled = await compileActiveProcessRuntime(process.data, organization.roles, organizationId);
  const action = compiled?.actions?.[actionId];
  if (!action?.relationMutation || action.relationMutation.operation !== 'link') {
    throw createError({ statusCode: 400, message: 'Action does not provide relation options' });
  }
  assertCompiledActionAvailable(actionId, auth);
  const owner = await resolveProcessGraphEntity(action.typeId, instanceId, { auth });
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

// Declaration-derived export actions (SPEC §Exports) execute through
// the generateAttachment command, which owns the binding resolution and
// the source-instance write gate.
export async function executeDerivedExportAction({ typeId, kind, instanceId } = {}, auth = {}) {
  if (!typeId || !kind || !instanceId) {
    throw createError({ statusCode: 400, message: 'Export type, kind, and instance are required' });
  }
  const organizationId = resolveOrganizationId(auth);
  const binding = (await exportersForOrganization(organizationId))
    .find(exporter => exporter.typeId === typeId && exporter.kind === kind);
  if (!binding) {
    throw createError({ statusCode: 404, message: `No export ${kind} is declared for ${typeId}` });
  }
  return executeCommand('generateAttachment', {
    entities: { source: { type: normalizeTypeId(typeId), id: String(instanceId) } },
    parameters: { kind }
  }, auth);
}

// The save floor: a persisted graph is structurally sound — nodes carry a
// unique id, a canvas type, and a numeric position, address their records,
// and edges address existing nodes and, after the persisted rewrites,
// sockets the addressed record carries. Semantic validity stays the
// validator's job (drafts may fail it mid-edit); integrity failures block
// the save.
function assertGraphIntegrity(input) {
  const data = authoredProcessData(input);
  if (!data || typeof data !== 'object' || !data.graph) return;
  const problems = graphIntegrityProblems(data);
  if (problems.length) {
    throw createError({ statusCode: 400, message: `Graph integrity: ${problems.slice(0, 5).join('; ')}` });
  }
  // Validate the authored process graph through the shared canonical graph
  // compiler before persistence.
  try {
    createProcessGraphDocument(data);
  } catch (error) {
    throw createError({
      statusCode: 400,
      message: `Canonical graph integrity: ${error?.message || String(error)}`
    });
  }
}

function assertEdgeSocketIntegrity(input) {
  const data = authoredProcessData(input);
  if (!data || typeof data !== 'object' || !data.graph) return;
  const problems = graphEdgeSocketProblems(data);
  if (problems.length) {
    throw createError({ statusCode: 400, message: `Graph integrity: ${problems.slice(0, 5).join('; ')}` });
  }
}

function isCanonicalProcessGraph(data = {}) {
  return data?.format === 'perigram.graph';
}

function authoredProcessData(data = {}) {
  return isCanonicalProcessGraph(data)
    ? (authoredProcessDataFromGraphDocument(data) || data)
    : data;
}

function withoutActivationFields(data) {
  const snapshot = structuredClone(data || {});
  for (const key of PROCESS_GRAPH_ACTIVATION_FIELDS) delete snapshot[key];
  return snapshot;
}

function compactAuthoredSnapshot(value) {
  if (!value || typeof value !== 'object') return value;
  return withoutActivationFields(
    isCanonicalProcessGraph(value) ? (authoredProcessDataFromGraphDocument(value) || value) : value
  );
}

function compactCanonicalSnapshot(value) {
  if (!value || typeof value !== 'object') return value;
  const snapshot = structuredClone(isCanonicalProcessGraph(value) ? value : createProcessGraphDocument(value));
  const metadata = snapshot.metadata?.[PROCESS_GRAPH_METADATA_KEY];
  if (metadata?.sourceData) {
    for (const key of PROCESS_GRAPH_ACTIVATION_FIELDS) delete metadata.sourceData[key];
  }
  for (const key of PROCESS_GRAPH_ACTIVATION_FIELDS) delete snapshot[key];
  return snapshot;
}

function compactHistory(history = []) {
  return (Array.isArray(history) ? history : []).slice(-50).map(entry => ({
    ...entry,
    data: compactAuthoredSnapshot(entry?.data)
  }));
}

function storedProcessData(authored, source, existingId = null, existing = null) {
  const sourceId = source?.id && source.id !== 'process' ? source.id : existingId;
  const graph = createProcessGraphDocument(authored, {
    ...(sourceId ? { id: sourceId } : {}),
    ...(source?.name && source.name !== 'Process graph' ? { name: source.name } : {})
  });
  const migrations = authored.migrations !== undefined ? authored.migrations : source.migrations;
  if (migrations !== undefined) graph.migrations = migrations;
  if (existing?.history !== undefined) graph.history = compactHistory(existing.history);
  if (existing?.activated !== undefined) graph.activated = compactCanonicalSnapshot(existing.activated);
  if (existing?.compiled !== undefined) graph.compiled = existing.compiled;
  return graph;
}

export async function create(payload = {}, auth) {
  const organizationId = payload.organizationId || resolveOrganizationId(auth);
  await assertOrgAccess(auth, organizationId, 'write');
  const name = payload.name || payload.identity?.name || 'Organization process';
  // Authored data persists in its own vocabulary (graph protocol v5 stays
  // v5): the persisted producer-identity rewrite runs on it, and protocol
  // acceptance (v5 lowering + binding checks) validates a copy.
  const domain = await getProjectedDomain(organizationId);
  // A create with no document (a bare name) starts from the empty
  // current-protocol draft; a raw document payload keeps its own shape.
  const source = payload.data || (payload.dataflowVersion ? payload : emptyAuthoredDocument());
  const seed = authoredProcessData(source);
  for (const key of ['sourceProcessDefinitionId', 'sourceTemplateId']) {
    if (source[key] !== undefined) seed[key] = source[key];
  }
  assertGraphIntegrity(source);
  const authored = persistedRewrites(structuredClone(seed), domain);
  assertEdgeSocketIntegrity(authored);
  const uid = `process-${new ObjectId().toString()}`;
  const process = new ProcessDefinition({
    identity: {
      uid,
      name,
      slug: standardSlugify(name, { keepCase: false })
    },
    lineage: { organizationId: toFlexibleId(organizationId) },
    data: storedProcessData(authored, { ...source, id: uid })
  });
  applyProcessState(process, 'DRAFT', auth.userId, 'Process draft created');
  setMigrationState(process, 'none');
  const created = await repository.create(process);
  return new ProcessDefinition(created).toJSON();
}

export async function update(id, payload = {}, auth) {
  const process = await loadAuthorized(id, auth, 'write');
  const renaming = payload.identity?.name || payload.name;
  // An identity-only PATCH leaves data untouched (the rename path).
  if (renaming && !payload.data) {
    process.identity.name = renaming;
    return new ProcessDefinition(await repository.updateById(id, process)).toJSON();
  }
  // One document for its whole life: data edits save in place, draft or
  // active — re-activation records the superseded graph in data.history.
  if (renaming) process.identity.name = renaming;
  assertGraphIntegrity(payload.data);
  const domain = await getProjectedDomain(process.lineage.organizationId);
  const authored = persistedRewrites(structuredClone(authoredProcessData(payload.data)), domain);
  assertEdgeSocketIntegrity(authored);
  const migrationState = process.data?.migrations?.state || null;
  process.data = storedProcessData(authored, payload.data, process.data?.id, process.data);
  process.data.compiled = null;
  if (process.data.migrations?.state || migrationState) {
    setMigrationState(process, process.data.migrations?.state || migrationState);
  }
  const updated = await repository.updateById(id, process);
  return new ProcessDefinition(updated).toJSON();
}

// Apply-diff baseline law: README §Migration gate and plan.
async function activeContractBaseline(process, auth) {
  const actives = (await repository.findActiveSetByOrganization(process.lineage.organizationId))
    .filter(active => String(active._id) !== String(process._id));
  if (!actives.length) return null;
  try {
    const roles = await loadOrganizationRoles(process.lineage.organizationId);
    const organizationId = process.lineage.organizationId;
    return await compileActiveProcessRuntime(
      mergeActiveDefinitions(actives.map(active => active.data.activated || active.data)),
      roles,
      organizationId
    );
  } catch {
    return null;
  }
}

// Activation is additive: the apply diff, the migration gate, and the
// migration itself resolve against the NEXT merged contract — this
// definition atop the other actives — so states owned by other active
// definitions stay valid targets and never read as removals.
async function mergedNextContract(process, roles) {
  const others = (await repository.findActiveSetByOrganization(process.lineage.organizationId))
    .filter(active => String(active._id) !== String(process._id))
    .map(active => active.data.activated || active.data);
  return await compileActiveProcessRuntime(
    mergeActiveDefinitions([...others, process.data]),
    roles,
    process.lineage.organizationId
  );
}

async function contractDiffFor(process, auth) {
  const baseline = await activeContractBaseline(process, auth);
  if (!baseline) return null;
  const roles = await loadOrganizationRoles(process.lineage.organizationId);
  try {
    return diffProcessContracts(baseline, await mergedNextContract(process, roles));
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
async function collectStrandedInstanceStatees(process, auth, nextCompiled) {
  const baseline = await activeContractBaseline(process, auth);
  if (!baseline) return [];
  const removed = diffProcessContracts(baseline, nextCompiled).removedInstanceStatees;
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
      const primary = typeof entity?.state === 'string' && entity.state
        ? entity.state
        : entity?.states?.main;
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
  // The draft's own declarations overlay the registry view at validation
  // too (the same rule save-time acceptance applies): a draft carrying
  // in-tree classes validates against them — they land in the registry
  // at Apply, not before.
  const validation = validateActivatableProcess(accepted, declarationOverlayDomain(process.data, domain), await loadOrganizationRoles(process.lineage.organizationId));
  const diff = await contractDiffFor(process, auth);
  let migrationPlan = null;
  if (diff?.removedInstanceStatees?.length) {
    try {
      const nextCompiled = await mergedNextContract(process, await loadOrganizationRoles(process.lineage.organizationId));
      const stranded = await collectStrandedInstanceStatees(process, auth, nextCompiled);
      if (stranded.length) migrationPlan = buildStatusMigrationPlan(stranded, nextCompiled);
    } catch {
      // The activate boundary recomputes the plan from fresh compiles; a
      // failed plan build here must not mask the validation result.
    }
  }
  return { ...validation, diff, ...(migrationPlan ? { migrationPlan } : {}) };
}

export async function activate(id, auth) {
  const process = await loadAuthorized(id, auth, 'admin');
  const publicationFrom = publicationStateOf(process);
  const previousMigrationState = process.data?.migrations?.state || 'none';
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
  const mergedNext = await mergedNextContract(process, roles);
  const stranded = mergedNext ? await collectStrandedInstanceStatees(process, auth, mergedNext) : [];
  const plan = stranded.length ? buildStatusMigrationPlan(stranded, mergedNext) : null;
  // Migration-decision law: README §Migration gate and plan (Decision).
  const mappings = normalizeStatusMappings(process.data?.migrations?.statuses);
  if (stranded.length) {
    if (!mappings.length) {
      setMigrationState(process, 'required');
      await repository.updateById(id, process);
      throwMigrationRequired(stranded, plan);
    }
    const mappingErrors = validateStatusMappings(plan, mappings);
    if (mappingErrors.length) {
      setMigrationState(process, 'required');
      await repository.updateById(id, process);
      throw createError({ statusCode: 400, message: mappingErrors.join('; '), data: { migrationPlan: plan } });
    }
    setMigrationState(process, 'required');
  } else {
    setMigrationState(process, previousMigrationState === 'incomplete' ? 'applied' : 'none');
  }
  // Version record (feature README): re-activating an already-active
  // definition preserves the superseded authored snapshot in data.history
  // before the new graph activates.
  if (publicationFrom === 'ACTIVE') {
    const history = [...(process.data.history || []), {
      at: new Date().toISOString(),
      actor: auth.userId || 'SYSTEM',
      data: compactAuthoredSnapshot(process.data)
    }];
    process.data.history = compactHistory(history);
  }
  applyPublicationState(process, 'activate', auth.userId, 'Process activated');
  // The runtime source for an active-set member is the snapshot that
  // activation published (feature README): edits accumulate as draft
  // data and go live only through activation.
  process.data.activated = compactCanonicalSnapshot(process.data);
  let updated = await repository.updateById(id, process);
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
      compiled: mergedNext
    });
    process.data.migrations = {
      ...(process.data.migrations || {}),
      statuses: mappings,
      state: migration.failures.length ? 'incomplete' : 'applied',
      applied: {
        appliedAt: new Date().toISOString(),
        actor: auth.userId || 'SYSTEM',
        applied: migration.applied,
        failures: migration.failures
      }
    };
    updated = await repository.updateById(id, process);
    if (migration.failures.length) {
      throw createError({
        statusCode: 500,
        message: `Migration incomplete: ${migration.failures.length} instance(s) failed to re-target. Re-apply with the same mappings to resume.`,
        data: { migrationIncomplete: true, migration: process.data.migrations.applied, migrationPlan: plan }
      });
    }
  }
  return new ProcessDefinition(updated).toJSON();
}

export async function createActiveEmptyProcess({ organizationId, actorId } = {}) {
  if (!organizationId) throw createError({ statusCode: 400, message: 'Organization id is required' });

  const organizationIdValue = toFlexibleId(organizationId);
  // The starter definition carries the mounted packs' and installed
  // plugins' starter constructs (SPEC §UI visible-by-default) — authored
  // through the same headless seam the designer and the stationing script
  // use, so validation, compilation, and activation run identically. The
  // projected domain (not the pack domain slices) is the validation
  // surface — it carries the entities the authored nodes address.
  const domain = await getProjectedDomain(organizationIdValue);
  const authoring = createDefinitionAuthoring(domain);
  for (const [index, construct] of (await starterConstructsForOrganization(organizationIdValue)).entries()) {
    const id = `starter-${index}`;
    const refId = `starter-ref-${index}`;
    authoring.drop('construct', { id });
    authoring.declareTypeRef({ id: refId, typeId: construct.typeId });
    authoring.wireDeclaration(refId, id, 'binds');
    authoring.configure(id, {
      construction: { mode: construct.construction },
      access: { level: 'admin', grants: [{ roleId: 'role_admin', level: 'admin' }] }
    });
  }
  const process = new ProcessDefinition({
    identity: {
      uid: `process-${organizationIdValue}`,
      name: 'Process',
      slug: 'process'
    },
    lineage: { organizationId: organizationIdValue },
    data: authoring.definition()
  });
  assertCurrentProcessDefinition(process.data);

  const roles = await loadOrganizationRoles(organizationId);
  const validation = validateActivatableProcess(process.data, domain, roles);
  if (!validation.ok) {
    throw createError({ statusCode: 400, message: validation.errors.join('; '), data: validation });
  }

  process.data = {
    ...process.data,
    compiled: await compileOrganizationProcess(process.data, process.lineage.organizationId, roles)
  };
  applyProcessState(process, 'ACTIVE', actorId || 'SYSTEM', 'Process activated (empty)');
  setMigrationState(process, 'none');

  const created = await repository.create(process);
  return new ProcessDefinition(created).toJSON();
}

// Deactivation removes one definition from the additive active set: state
// returns to DRAFT (editable, re-activatable) and the runtime contract
// re-derives from the remaining actives.
export async function deactivate(id, auth) {
  const process = await loadAuthorized(id, auth, 'admin');
  applyPublicationState(process, 'deactivate', auth.userId, 'Process deactivated');
  const updated = await repository.updateById(id, process);
  await ensureInstanceIndexes((await compileRegistryForOrganization(process.lineage.organizationId)).resolveView(process.lineage.organizationId));
  publishOrgContractChanged(String(process.lineage.organizationId), 'process', { definitionId: String(updated._id) });
  return new ProcessDefinition(updated).toJSON();
}

export async function remove(id, auth) {
  const process = await loadAuthorized(id, auth, 'admin');
  await repository.removeById(id);
  if (process.status?.state?.primary === 'ACTIVE') {
    await ensureInstanceIndexes((await compileRegistryForOrganization(process.lineage.organizationId)).resolveView(process.lineage.organizationId));
    publishOrgContractChanged(String(process.lineage.organizationId), 'process', { definitionId: String(id) });
  }
  return { removed: true };
}

export async function archive(id, auth) {
  const process = await loadAuthorized(id, auth, 'admin');
  const { from } = applyPublicationState(process, 'archive', auth.userId, 'Process archived');
  const updated = await repository.updateById(id, process);
  if (from === 'ACTIVE') {
    await ensureInstanceIndexes((await compileRegistryForOrganization(process.lineage.organizationId)).resolveView(process.lineage.organizationId));
    publishOrgContractChanged(String(process.lineage.organizationId), 'process', { definitionId: String(id) });
  }
  return new ProcessDefinition(updated).toJSON();
}

function manualRunEnvironment(definition, auth = {}, domain = null) {
  return {
    executeEffect: (request, run) => executeDurableEffect(request, auth, run, authoredProcessData(definition.data), domain),
    isAsyncBoundary: (request, result) => request.kind === 'cts.command' && hasAsyncOutputBoundary(result),
    catalogContext: catalogContextFromDefinition(definition.data, domain),
    // Evaluator-domain law: README §Socket projection and auth hydration.
    domain: domain || getDomain(),
    data: run => processDataEnvironment(auth, run, domain)
  };
}

// Async command effects park the evaluation on the task boundary; the
// task runtime's terminal boundary continues it in this process.
// command_runs and task_runs are the audit trail.
const pendingActionContinuations = new Map();

function dispatchTaskRunId(dispatch = {}) {
  return String(dispatch?.taskRunId || dispatch?.taskId || dispatch?.tasks?.[0]?.id || dispatch?.jobs?.[0]?.id || '');
}

function advanceToBoundary(run, definition, environment) {
  let state = run;
  return (async function step() {
    if (state.status !== 'running') return state;
    const advanced = await advanceProcessRun(state, definition, environment(state));
    if (advanced === state || JSON.stringify(advanced) === JSON.stringify(state)) return state;
    state = advanced;
    return step();
  })();
}

/**
 * Evaluates a definition's dataflow in-process: the same graph evaluator
 * preview uses, driven to settled or the first async command boundary.
 * At the boundary the continuation is registered under the enqueued
 * task-run id for the task runtime's terminal boundary to continue.
 */
async function evaluateDataflow(definition, payload = {}, { auth, actor, domain = null }) {
  const projectedDomain = domain || await getProjectedDomain(resolveOrganizationId(auth));
  const runnableDefinition = {
    ...definition,
    data: currentProcessDefinition(definition.data, projectedDomain)
  };
  const base = manualRunEnvironment(runnableDefinition, auth, projectedDomain);
  // Durable traversal consumes the canonical graph document used by graph
  // authoring and validation.
  const canonicalGraph = createProcessGraphDocument(runnableDefinition);
  const run = createProcessRun(canonicalGraph, payload.trigger || {}, {
    processDefinitionId: runnableDefinition._id || runnableDefinition.id,
    context: { inputs: payload.inputs || {}, actor: actor || buildRunActor(auth, resolveOrganizationId(auth)) }
  });
  const environment = parkingEnvironment(runnableDefinition, base);
  const settled = await advanceToBoundary(run, canonicalGraph, environment);
  if (settled.status === 'waiting' && settled.wakeAt) {
    // A Wait Until park is durable: the run store owns the wake.
    await persistRun(runnableDefinition, settled);
  }
  return settled;
}

// Effect dispatch with the async-command parking boundary: a command with
// a task-run dispatch parks the evaluation in memory under the task id;
// the task runtime's terminal boundary continues it.
function parkingEnvironment(runnableDefinition, base) {
  return current => ({
    ...base,
    executeEffect: async (request, runState) => {
      const dispatch = await base.executeEffect(request, runState);
      if (!base.isAsyncBoundary(request, dispatch)) return dispatch;
      const taskRunId = dispatchTaskRunId(dispatch);
      if (!taskRunId) return dispatch;
      const snapshot = snapshotInvocation(request, runnableDefinition.data);
      pendingActionContinuations.set(taskRunId, {
        run: structuredClone(runState),
        definition: runnableDefinition,
        actor: runState?.context?.actor || {},
        snapshot
      });
      return { __processEffectPending: true };
    },
    // The orchestration seam consumes the materialized data environment
    // object (it spreads environment.data per evaluated node).
    data: base.data(current)
  });
}

export async function resolveRunActor(storedActor, organizationId) {
  const runOrganizationId = String(organizationId || '');
  if (storedActor?.userId === 'SYSTEM' && storedActor?.system === true) {
    if (storedActor.organizationId && runOrganizationId
      && String(storedActor.organizationId) !== runOrganizationId) {
      throw createError({ statusCode: 403, message: 'Parked run actor organization does not match its definition' });
    }
    return {
      ...storedActor,
      organizationId: storedActor.organizationId || runOrganizationId || null
    };
  }

  if (!storedActor?.userId) {
    throw createError({ statusCode: 401, message: 'Parked process run has no authenticated actor' });
  }
  if (!runOrganizationId) {
    throw createError({ statusCode: 403, message: 'Parked user run has no organization scope' });
  }
  if (storedActor.organizationId && String(storedActor.organizationId) !== runOrganizationId) {
    throw createError({ statusCode: 403, message: 'Parked run actor organization does not match its definition' });
  }

  const user = await usersService.getById(storedActor.userId);
  if (!user) throw createError({ statusCode: 401, message: 'Parked run actor no longer exists' });
  const currentAuth = usersService.buildAuthContext(user);
  const activeMembership = currentAuth.memberships?.find(
    membership => String(membership.organizationId) === runOrganizationId
  );
  if (!activeMembership) {
    throw createError({ statusCode: 403, message: 'Parked run actor is no longer an active organization member' });
  }
  return await resolveProcessAuth({ ...currentAuth, organizationId: runOrganizationId });
}

export async function resumeParkedRun(record) {
  const definitionLike = {
    _id: record.definitionId,
    lineage: { organizationId: record.organizationId },
    data: record.definitionData
  };
  // Rehydrate the persisted actor; never fall back to SYSTEM for malformed
  // or stale user runs.
  const auth = await resolveRunActor(record.run?.context?.actor, record.organizationId);
  const domain = await getProjectedDomain(record.organizationId);
  const base = manualRunEnvironment(definitionLike, auth, domain);
  const canonicalGraph = createProcessGraphDocument(definitionLike);
  const resumedRun = {
    ...record.run,
    context: { ...(record.run?.context || {}), actor: auth }
  };
  const resumed = await resumeProcessRun(resumedRun, canonicalGraph, { output: {} }, {
    catalogContext: base.catalogContext,
    domain,
    data: base.data(resumedRun)
  });
  const settled = await advanceToBoundary(resumed, canonicalGraph, parkingEnvironment(definitionLike, base));
  await persistRun(definitionLike, settled, { kind: record.kind, nodeId: record.nodeId });
  return settled;
}

export async function runDefinitionEntry(definition, trigger = {}, meta = {}) {
  const organizationId = meta.organizationId ?? definition.lineage?.organizationId ?? null;
  const systemAuth = { userId: 'SYSTEM', system: true, memberships: [], organizationId };
  const run = await evaluateDataflow(definition, { trigger }, { auth: systemAuth });
  await persistRun(definition, run, { kind: meta.kind || 'action', nodeId: meta.nodeId || '' });
  return run;
}

export async function evaluateDefinitionDataflow(id, payload = {}, auth = {}) {
  const process = await loadAuthorized(id, auth, 'read');
  const definition = process.toJSON ? process.toJSON() : { ...process };
  if (Number(authoredProcessData(definition.data)?.dataflowVersion) !== PROCESS_DATAFLOW_VERSION) {
    throw createError({ statusCode: 409, message: `Process must use dataflow version ${PROCESS_DATAFLOW_VERSION} before it can run` });
  }
  const run = await evaluateDataflow(definition, payload, { auth });
  assertManualRunHasNoMutationFailures(run);
  return serializeProcessResult(run);
}

/**
 * The task runtime's terminal boundary for succeeded tasks: continues a
 * parked action evaluation with the task's projected completion output.
 * An unknown task-run id is an uncorrelated no-op; command_runs and
 * task_runs remain the completion record.
 */
export async function continueActionFromTask({ taskRunId, taskResult = {} } = {}) {
  const key = String(taskRunId || '');
  const continuation = key && pendingActionContinuations.get(key);
  if (!continuation) return { applied: false, reason: 'uncorrelated' };
  pendingActionContinuations.delete(key);
  const { run, definition, actor, snapshot } = continuation;
  const organizationId = actor.organizationId ?? definition.lineage?.organizationId ?? null;
  const executionAuth = await resolveRunActor(actor, organizationId);
  const domain = await getProjectedDomain(organizationId);
  const resumedRun = {
    ...run,
    context: { ...(run?.context || {}), actor: executionAuth }
  };
  const canonicalGraph = createProcessGraphDocument(definition);
  const resumed = await resumeProcessRun(resumedRun, canonicalGraph, {
    output: projectedCompletionOutput(snapshot, taskResult)
  }, {
    catalogContext: catalogContextFromDefinition(definition.data, domain),
    domain,
    data: processDataEnvironment(executionAuth, resumedRun, domain)
  });
  await advanceToBoundary(resumed, canonicalGraph, current => ({
    ...manualRunEnvironment(definition, executionAuth, domain),
    data: processDataEnvironment(executionAuth, current, domain)
  }));
  return { applied: true };
}

/**
 * The task runtime's terminal boundary for failed or cancelled tasks:
 * the parked evaluation, if any, fails with the task's cause.
 */
export async function failActionFromTask({ taskRunId, error = null, cancelled = false } = {}) {
  const key = String(taskRunId || '');
  const continuation = key && pendingActionContinuations.get(key);
  if (!continuation) return { applied: false, reason: 'uncorrelated' };
  pendingActionContinuations.delete(key);
  continuation.run = failRunState(continuation.run, { error, cancelled });
  return { applied: true };
}

// The mutation mapper collects per-slot failures so batch flows keep going
// (continue-and-collect), which leaves the run itself 'succeeded'. A manual
// run is a single user intent: a failed slot is the action's failure, not a
// silent partial success behind a success toast. Surface the underlying
// mutation error (invalid transition, missing machine, denied access) as
// the action error. Every effect step is scanned: a failed upstream slot
// often only surfaces downstream as a confusing data error, and the
// collected failure is the root cause the user needs to see.
function assertManualRunHasNoMutationFailures(run) {
  const failures = [...(run?.steps || [])]
    .flatMap(step => (Array.isArray(step?.output?.failures) ? step.output.failures : []));
  if (!failures.length) return;
  const message = failures
    .map(failure => failure?.error?.message)
    .filter(Boolean)
    .join('; ') || 'Action failed';
  throw createError({ statusCode: 400, message });
}

function buildRunActor(auth, organizationId) {
  return {
    userId: auth.userId,
    ...(auth.system === true || auth.userId === 'SYSTEM' ? { system: true } : {}),
    organizationId,
    role: auth.role,
    isAdmin: Boolean(auth.isAdmin),
    memberships: auth.memberships || [],
    roleAssignments: auth.roleAssignments || {},
    permissions: auth.permissions || [],
    effectivePermissions: auth.effectivePermissions || {}
  };
}

function catalogContextFromDefinition(processData, domain = null) {
  // The projected domain owns field schemas for pack and org types alike;
  // the static getter only knows the legacy tables. Socket derivation must
  // see the same schemas compilation validated against, or wired/prompted
  // fields on org types resolve no port and silently drop from the patch.
  const projectedSchemas = domain?.fieldSchemas || null;
  const schemasFor = typeId => projectedSchemas?.[typeId] ?? getEntityFieldSchemas(typeId);
  return record => {
    const structural = record.kind === 'cts.compose';
    const recordSchemas = structural ? getBlockFieldSchemas(record.block) : schemasFor(record.typeId);
    return {
      fieldSchema: structural
        ? getBlockFieldSchema(record.path)
        : (recordSchemas || []).find(field => field.path === record.path) || getEntityFieldSchema(record.typeId, record.path),
      fieldSchemas: recordSchemas,
      blockComposition: null,
      command: record.commandId ? getAppRegistry().getCommandDefinition(record.commandId) : null,
      // The projected domain carries the registered serviceContracts: a
      // cts.service record resolves its signature-derived sockets from it
      // at run time exactly as the designer does.
      domain: domain || getDomain()
    };
  };
}

function routeSourceId(route) {
  return String(route?.sourceNodeId || route?.fromNodeId || route?.source?.nodeId || route?.from?.nodeId || '');
}

function socketIdOf(value) {
  return String(value?.socketId || value?.id || value?.key || value || '');
}

// The async-boundary snapshot a parked action continues from: the
// sockets the task's completion may project onto and the routes a
// receipt may advance.
function snapshotInvocation(request = {}, processData = {}) {
  const record = request.record || {};
  const nodeId = String(record.nodeId || record.id || request.nodeId || '');
  const declaredSockets = request.expectedCompletionSockets
    || record.expectedCompletionSockets
    || record.outputSockets
    || record.outputs
    || [];
  const allRoutes = processData.routes || processData.connections || processData.edges || [];
  const routes = request.connectedRoutes || allRoutes.filter(route => !nodeId || routeSourceId(route) === nodeId);
  return {
    expectedCompletionSockets: declaredSockets.map(socketIdOf).filter(Boolean),
    connectedRoutes: structuredClone(routes),
    producerOutputId: request.producerOutputId || record.producerOutputId || null,
    producerIdentity: structuredClone(request.producerIdentity || record.producerIdentity || {
      nodeId,
      outputSocketId: socketIdOf(record.producerOutputId || record.outputSocketId)
    })
  };
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
  if (['succeeded', 'failed', 'cancelled'].includes(state.status)) return state;
  const next = structuredClone(state);
  const failure = { message: error?.message || String(error || 'Task failed'), statusCode: error?.statusCode || null };
  const pendingStepId = next.pendingEffect?.stepId;
  if (pendingStepId) {
    const step = next.steps.find(item => item.id === pendingStepId);
    if (step) {
      transitionProcessStep(step, cancelled ? 'cancelled' : 'failed');
      step.error = failure;
      step.completedAt = new Date().toISOString();
    }
  }
  delete next.pendingEffect;
  transitionProcessRun(next, cancelled ? 'cancelled' : 'failed');
  next.error = failure;
  next.updatedAt = new Date().toISOString();
  return next;
}

export async function preview({ definition, nodeId = '', trigger = {}, inputs = {} } = {}, auth = {}) {
  const organizationId = resolveOrganizationId(auth);
  await assertOrgAccess(auth, organizationId, 'read');
  if (!definition || Number(authoredProcessData(definition.data || definition)?.dataflowVersion) !== PROCESS_DATAFLOW_VERSION) {
    throw createError({ statusCode: 400, message: `Preview requires dataflow version ${PROCESS_DATAFLOW_VERSION}` });
  }
  // Preview receives client-authored definitions: protocol acceptance runs
  // here too, so a v5 draft previews against the same lowered shapes the
  // compiler and runtime would use.
  const previewDomain = await getProjectedDomain(organizationId);
  const previewDefinition = {
    ...definition,
    data: currentProcessDefinition(definition.data || definition, previewDomain)
  };
  const run = { context: { inputs }, trigger };
  // Preview results cross the HTTP boundary, so the missing-field markers
  // produced by the evaluator are converted to their serializable tag here —
  // the single emission conversion point shared with any runtime result
  // emission (see packages/processes/src/missing-field.js).
  const canonicalGraph = createProcessGraphDocument(previewDefinition);
  return serializeProcessResult(await previewProcessDataflow(canonicalGraph, { trigger, inputs }, {
    targetNodeId: nodeId,
    previewLimit: 100,
    domain: previewDomain,
    // Value services evaluate in preview scope (SPEC §28): endpoint services
    // use their synchronous adapter; managed pure/read services execute
    // through the installed package worker. No command_runs write occurs.
    previewService: (operatorId, parameters) => invokePreviewValueService(operatorId, parameters, auth),
    catalogContext: record => {
      const structural = record.kind === 'cts.compose';
      return {
        fieldSchema: structural ? getBlockFieldSchema(record.path) : getEntityFieldSchema(record.typeId, record.path),
        fieldSchemas: structural ? getBlockFieldSchemas(record.block) : getEntityFieldSchemas(record.typeId),
        blockComposition: null,
        command: record.commandId ? getAppRegistry().getCommandDefinition(record.commandId) : null,
        domain: previewDomain
      };
    },
    data: processDataEnvironment(auth, run, previewDomain)
  }));
}

export async function projectEntityThroughSocket({ socketId, instanceId, targetOrganizationId } = {}, auth = {}) {
  const organizationId = resolveOrganizationId(auth);
  await assertOrgAccess(auth, organizationId, 'read');
  if (!socketId) throw createError({ statusCode: 400, message: 'Socket id is required' });
  if (!instanceId) throw createError({ statusCode: 400, message: 'Entity id is required' });

  const process = await loadActiveSetProcess(auth);
  const socket = authoredProcessData(process.data).sockets?.[socketId];
  if (!socket) throw createError({ statusCode: 404, message: 'Socket not found in active process' });
  if (socket.direction === 'inbound') {
    throw createError({ statusCode: 400, message: 'Inbound sockets receive projected entities and cannot project source entities' });
  }

  const registry = getAppRegistry();
  const service = registry.getInstanceService(socket.typeId);
  if (!service?.processGetById) throw createError({ statusCode: 500, message: `Entity service cannot read ${socket.typeId} from a process` });
  const entity = await service.processGetById(instanceId, auth);
  if (!entity) throw createError({ statusCode: 404, message: `${socket.typeId} not found` });

  const domainEntity = (getDomain().entities || []).find(item => item.type === socket.typeId);
  assertEntityAccess({
    entity,
    typeId: socket.typeId,
    feature: socket.feature || domainEntity?.collection || `${socket.typeId}s`,
    level: 'read',
    action: 'view',
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

export async function executeActiveProcessAction({ actionId, instanceId, data = {}, parameters = {}, entities = {}, targetOrganizationId = null, rerun = false } = {}, auth = {}) {
  const organizationId = resolveOrganizationId(auth);
  if (!actionId) throw createError({ statusCode: 400, message: 'Action id is required' });
  const process = await loadActiveSetProcess(auth);
  const organization = await loadOrganizationProcessConfiguration(organizationId);
  const compiled = await compileActiveProcessRuntime(process.data, organization.roles, organizationId);
  const action = compiled?.actions?.[actionId];
  if (!action) throw createError({ statusCode: 404, message: 'Action not found in active process' });
  assertCompiledActionAvailable(actionId, auth);
  if (action.relationMutation) {
    if (data?.relationCreator) {
      const creatorId = action.relationMutation.creator?.actionId;
      const creatorAction = creatorId && compiled.actions?.[creatorId];
      if (!creatorAction || ![].concat(action.relationMutation.targetTypes || []).includes(creatorAction.typeId)) {
        throw createError({ statusCode: 400, message: 'Relation action has no compatible creator' });
      }
      const created = await executeDataflowActionRun({
        process,
        actionId: creatorId,
        instanceId: null,
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
        instanceId,
        data: {
          relations: { [action.relationMutation.key]: { type: creatorAction.typeId, id: createdId } },
          ...(data.relationReplaces ? { relationReplaces: data.relationReplaces } : {})
        },
        entities
      }, auth);
      return { created, owner };
    }
    return await executeCompiledRelationMutationAction({ action, actionId, instanceId, data, entities }, auth);
  }
  assertCurrentProcessDefinition(process.data);
  return executeDataflowActionRun({
    process,
    actionId,
    instanceId,
    data,
    parameters,
    entities,
    targetOrganizationId,
    rerun
  }, auth);
}

async function executeCompiledRelationMutationAction({ action, actionId, instanceId, data = {}, entities = {} } = {}, auth = {}) {
  const targetValue = instanceId || entities?.entity || entities?.[action.typeId];
  const targetId = normalizeInstanceRef(targetValue)?.id || targetValue;
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
  const { relationReplaces, ...relationPatch } = mutation;
  const contract = action.relationMutation;
  let unlinkTarget = null;
  if (contract?.operation === 'unlink' && contract.unlink === 'delete') {
    const unlinkedRef = normalizeRelationRef(getByPath(selectedMutation, `relations.${contract.key}`), contract.targetTypes);
    const targetService = getAppRegistry().getInstanceService(unlinkedRef.type);
    if (!targetService?.processGetById || !targetService?.processDelete) {
      throw createError({ statusCode: 400, message: `Entity service cannot delete ${unlinkedRef.type}` });
    }
    // Authorize and scope the destructive target before persisting the
    // owner's unlink. Otherwise a denied/missing target leaves a half-
    // applied relation mutation.
    const targetEntity = await targetService.processGetById(unlinkedRef.id, executionAuth);
    if (!targetEntity) {
      throw createError({ statusCode: 404, message: `${unlinkedRef.type} ${unlinkedRef.id} not found` });
    }
    assertEntityAccess({
      entity: targetEntity?.toJSON ? targetEntity.toJSON() : targetEntity,
      typeId: unlinkedRef.type,
      feature: resolveInstanceFeature(unlinkedRef.type),
      level: 'write',
      action: 'delete',
      auth: executionAuth
    });
    unlinkTarget = { ref: unlinkedRef, service: targetService };
  }
  const updated = await persistProcessEntityPatch(typeId, targetId, relationPatch, executionAuth);
  await publishActionEntityEvent(auth, typeId, updated || { _id: targetId }, 'updated', 'process-relation-update');
  if (unlinkTarget) {
    await unlinkTarget.service.processDelete(unlinkTarget.ref.id, executionAuth);
    await publishActionEntityEvent(executionAuth, unlinkTarget.ref.type, { _id: unlinkTarget.ref.id }, 'deleted', 'relation-unlink-delete');
  }
  return updated;
}

async function resolveManualRelationMutation(typeId, targetId, mutation = {}, action = {}, auth = {}) {
  const contract = action.relationMutation;
  const key = contract?.key;
  const targetValue = getByPath(mutation, `relations.${key}`);
  const targetRef = normalizeRelationRef(targetValue, contract?.targetTypes);
  await assertRelationTargetAvailable(targetRef, contract, auth);
  // Unlink-with-delete is a second write against the related entity, not
  // implied by the owner's relation-edit grant. Authorize it before the
  // owner patch so a denied delete cannot leave a half-applied unlink.
  if (contract?.operation === 'unlink' && contract.unlink === 'delete') {
    const targetService = getAppRegistry().getInstanceService(targetRef.type);
    const targetEntity = await loadProcessEffectEntity(targetService, targetRef.type, targetRef, auth);
    assertEntityAccess({
      entity: targetEntity,
      typeId: targetRef.type,
      feature: resolveInstanceFeature(targetRef.type),
      level: 'write',
      action: 'delete',
      auth
    });
  }
  const replacementRef = mutation.relationReplaces
    ? normalizeRelationRef(mutation.relationReplaces, contract?.targetTypes)
    : null;

  const service = getAppRegistry().getInstanceService(typeId);
  const currentRecord = await service?.processGetById?.(targetId, auth);
  if (!currentRecord) throw createError({ statusCode: 404, message: `${typeId} not found` });
  const current = currentRecord?.toJSON ? currentRecord.toJSON() : currentRecord;
  const currentValue = current.relations?.[key];

  if (contract.cardinality !== 'many') {
    if (contract.operation === 'unlink' && currentValue) {
      const currentRef = normalizeRelationRef(currentValue, contract.targetTypes);
      if (`${currentRef.type}:${currentRef.id}` !== `${targetRef.type}:${targetRef.id}`) {
        throw createError({ statusCode: 400, message: `Selected ${targetRef.type} is not linked through ${key}` });
      }
    }
    return {
      relations: {
        [key]: contract.operation === 'unlink' ? null : targetRef
      }
    };
  }

  const refs = (Array.isArray(currentValue) ? currentValue : currentValue ? [currentValue] : [])
    .map(item => normalizeRelationRef(item, contract.targetTypes));
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

async function executeDataflowActionRun({ process, actionId, instanceId, data, parameters, entities, targetOrganizationId, rerun = false }, auth) {
  const effect = Object.values(authoredProcessData(process.data).processNodes || {})
    .find(node => node.id === actionId && node.kind?.startsWith('cts.'));
  if (!effect || (effect.trigger?.mode || 'manual') !== 'manual') {
    throw createError({ statusCode: 409, message: `Action ${actionId} has no entry trigger` });
  }
  // Re-derive (SPEC §24, owner decision 2026-10-27): a construct action
  // re-run over its record's stored inputs executes against the refs'
  // pinned revisions and patches the same instance. An explicit rerun
  // launch only — a context instance alone stays parent context for a
  // fresh create.
  if (rerun && effect.kind === 'cts.construct' && effect.typeId && instanceId) {
    const targetId = String(instanceId);
    const service = getAppRegistry().getInstanceService(effect.typeId);
    const contextRecord = await service?.processGetById?.(targetId, auth).catch(() => null);
    if (!contextRecord) {
      throw createError({ statusCode: 404, message: `${effect.typeId} ${targetId} not found` });
    }
    const mode = effect.construction?.mode || '';
    const organizationId = resolveOrganizationId(auth);
    const rederived = await service.rederive(targetId, mode, {
      provenance: { op: `${effect.kind}:${effect.id}${mode ? `:${mode}` : ''}` },
      userId: auth.userId,
      organizationId,
      auth
    });
    await publishActionEntityEvent(auth, effect.typeId, rederived, 'mutated', 'process-rederive');
    return rederived;
  }
  const graphNode = (authoredProcessData(process.data).graph?.nodes || [])
    .find(node => String(node.data?.refId || node.id) === String(effect.id));
  if (!graphNode) throw createError({ statusCode: 409, message: `Action ${actionId} has no graph node` });
  const run = await evaluateDataflow(process, {
    trigger: { nodeId: graphNode.id },
    inputs: {
      entity: instanceId || entities?.entity || null,
      entities: {
        ...(entities || {}),
        // The transport's instanceId is the operated entity for consumer
        // actions; for a construct it is parent context and stays untyped.
        ...(['cts.mutate', 'cts.transition', 'cts.remove'].includes(effect.kind) && effect.typeId && (instanceId || entities?.entity)
          ? { [effect.typeId]: instanceId || entities.entity }
          : {})
      },
      data,
      parameters,
      targetOrganizationId
    }
  }, { auth });
  if (run.status === 'failed') {
    throw createError({
      statusCode: 400,
      message: run.error?.message || `Action ${actionId} failed`,
      ...(Array.isArray(run.error?.failures) && run.error.failures.length
        ? { data: { failures: run.error.failures } }
        : {})
    });
  }
  const effectStep = [...(run.steps || [])].reverse()
    .find(step => step.kind?.startsWith('cts.'));
  const outcome = effectStep?.output ?? run.result;
  // A settled run may carry mutation failures on the effect's report:
  // the action refuses with the first failure's body — a structured
  // refusal keeps its named offenders (SPEC §24).
  const mutationFailures = Array.isArray(outcome?.failures) ? outcome.failures : [];
  if (mutationFailures.length) {
    const first = mutationFailures[0]?.error || {};
    throw createError({
      statusCode: first.statusCode || 400,
      message: first.message || `Action ${actionId} failed`,
      ...(Array.isArray(first.failures) && first.failures.length
        ? { data: { failures: first.failures } }
        : {})
    });
  }
  return outcome;
}

export async function resolveProcessGraphEntity(typeId, candidate, { instanceId = null, entities = {}, auth = {} } = {}) {
  if (candidate && typeof candidate === 'object' && !Array.isArray(candidate) && !normalizeInstanceRef(candidate)) {
    return candidate;
  }
  const supplied = candidate ?? entities?.[typeId] ?? entities?.entity ?? instanceId;
  const ref = normalizeInstanceRef(supplied);
  const id = ref?.id || (typeof supplied === 'string' ? supplied : null);
  if (!id) throw new Error(`No ${typeId} entity was supplied to the process graph`);
  const service = getAppRegistry().getInstanceService(typeId);
  if (!service?.processGetById) throw new Error(`Entity service cannot read ${typeId} from a process`);
  const entity = await service.processGetById(id, auth);
  if (!entity) throw new Error(`${typeId} ${id} was not found`);
  return entity?.toJSON ? entity.toJSON() : entity;
}

export async function executeProcessQuery(processList, filters = {}, auth) {
  return await processList(filters, auth);
}

async function queryProcessGraphEntities(typeId, filters = {}, auth = {}) {
  const service = getAppRegistry().getInstanceService(typeId);
  if (!service?.processList) throw new Error(`Entity service cannot query ${typeId} from a process`);
  const entities = await service.processList(filters, auth);
  return (entities || []).map(entity => entity?.toJSON ? entity.toJSON() : entity);
}

function entityInputId(value) {
  if (!value) return null;
  if (typeof value !== 'object') return value;
  const tree = Array.isArray(value.branches) ? value : (Array.isArray(value.result?.branches) ? value.result : null);
  if (tree) {
    const items = tree.branches.flatMap(branch => branch.items || []).filter(item => item && !item.error);
    return items.length === 1 ? entityInputId(items[0]) : null;
  }
  return value.id || value._id || null;
}

async function publishActionEntityEvent(auth, typeId, entity, change, reason) {
  await entityEventService.publishEntityChanged(auth, {
    type: typeId,
    id: instanceId(entity),
    change,
    reason
  });
}

function instanceId(entity = {}) {
  return entity?._id || entity?.id || null;
}

function hasAsyncOutputBoundary(result = {}) {
  return (result.tasks || []).length > 0
    || (result.raw?.tasks || []).length > 0
    || [...(result.jobs || []), ...(result.raw?.jobs || [])].some(job => ['task_run', 'task'].includes(job?.type));
}

export async function getByIdInternal(id) {
  const raw = await repository.findById(id);
  return raw ? new ProcessDefinition(raw).toJSON() : null;
}

const PUBLICATION_TRANSITIONS = Object.freeze({
  DRAFT: Object.freeze({ activate: 'ACTIVE', archive: 'ARCHIVED' }),
  ACTIVE: Object.freeze({ activate: 'ACTIVE', deactivate: 'DRAFT', archive: 'ARCHIVED' }),
  ARCHIVED: Object.freeze({ activate: 'ACTIVE', archive: 'ARCHIVED' })
});

const MIGRATION_STATES = Object.freeze(['none', 'required', 'applied', 'incomplete']);

function publicationStateOf(process) {
  return process.status?.state?.primary || 'DRAFT';
}

function applyPublicationState(process, event, userId, note) {
  const from = publicationStateOf(process);
  const to = PUBLICATION_TRANSITIONS[from]?.[event];
  if (!to) {
    throw createError({ statusCode: 409, message: `Cannot ${event} a process definition in ${from}` });
  }
  applyProcessState(process, to, userId, note);
  return { from, to };
}

function setMigrationState(process, state) {
  const value = MIGRATION_STATES.includes(state) ? state : 'none';
  process.data.migrations = { ...(process.data.migrations || {}), state: value };
}

function applyProcessState(process, primary, userId, note) {
  process.applyStatus(createStatusState(primary), userId || 'SYSTEM', { note });
}

const {
  assertCompiledActionAvailable,
  resolveActionTypeId,
  createActionExecutionAuth,
  createRelationLinkExecutionAuth,
  resolveInstanceFeature
} = createActionExecutionAuthHelpers({
  getDomain,
  normalizeTypeId,
  getEntityFieldAccessPolicy,
  getCommandDefinition: commandId => getAppRegistry().getCommandDefinition(commandId)
});

function pickMutationData(data = {}, action = {}, entities = {}) {
  const fields = action.mutation?.fields || [];
  if (!fields.length) return {};
  const picked = {};
  for (const field of fields) {
    const relationKey = field.startsWith('relations.') ? field.slice('relations.'.length) : '';
    // Callers address a field by its socket spelling (`fields.done`), the
    // bare row path (`done`), or a flat dotted key — all one field; the
    // first present spelling wins and `false` travels as false.
    const value = getByPath(data, field)
      ?? (Object.hasOwn(data, field) ? data[field] : undefined)
      ?? (field.startsWith('fields.') ? getByPath(data, field.slice('fields.'.length)) : undefined)
      ?? (relationKey ? (entities[`relation:${relationKey}`] ?? entities[relationKey]) : undefined);
    if (value !== undefined) setByPath(picked, field, value);
  }
  return picked;
}

async function normalizeProcessMutation(typeId, mutation = {}, relationContracts = [], auth = {}, featureForType = null) {
  if (!mutation.relations) return mutation;
  const normalizedRelations = {};
  for (const [key, value] of Object.entries(mutation.relations)) {
    // A relation edge may accept several target types: the written ref's
    // own type selects the contract (one declared entry per accepted
    // target).
    const declared = relationContracts.filter(item => (
      normalizeTypeId(item.ownerType) === normalizeTypeId(typeId) && item.key === key
    ));
    if (!declared.length) {
      throw createError({ statusCode: 400, message: `Action cannot write undeclared relation ${typeId}.${key}` });
    }
    const values = Array.isArray(value) ? value : [value];
    const refs = [];
    for (const item of values) {
      const refType = normalizeTypeId(item?.type || '');
      const relation = declared.length === 1
        ? declared[0]
        : (declared.find(contract => normalizeTypeId(contract.targetType) === refType) || null);
      if (!relation) {
        throw createError({ statusCode: 400, message: `Relation ${typeId}.${key} does not accept ${refType || '(untyped)'}` });
      }
      const ref = normalizeRelationRef(item, relation.targetType);
      await assertRelationTargetAvailable(ref, relation, auth, featureForType);
      refs.push(ref);
    }
    const cardinality = declared[0].cardinality || 'one';
    if (cardinality === 'one' && refs.length !== 1) {
      throw createError({ statusCode: 400, message: `Relation ${typeId}.${key} accepts exactly one entity` });
    }
    normalizedRelations[key] = cardinality === 'many'
      ? Array.from(new Map(refs.map(ref => [`${ref.type}:${ref.id}`, ref])).values())
      : refs[0];
  }
  return { ...mutation, relations: normalizedRelations };
}

function processRelationContracts(record = {}, processData = {}, domain = getDomain()) {
  const actionId = String(record.entryTriggerId || record.id || '');
  return normalizeProcessDefinition(processData, domain).actions?.[actionId]?.mutation?.relationContracts || [];
}

function declaredRelationValues(value, contracts = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(contracts
    .filter(contract => Object.hasOwn(value, contract.key))
    .map(contract => [contract.key, value[contract.key]]));
}

async function normalizeProcessPatchRelations(typeId, patch = {}, contracts = [], auth = {}, featureForType = null) {
  // The mutate patch carries its relation writes nested; the declared
  // contracts select which of them the write may normalize.
  const values = patch.relations && typeof patch.relations === 'object' && !Array.isArray(patch.relations)
    ? patch.relations
    : {};
  const relations = Object.fromEntries(contracts
    .filter(contract => Object.hasOwn(values, contract.key))
    .map(contract => [contract.key, values[contract.key]]));
  if (!Object.keys(relations).length) return patch;
  const normalized = await normalizeProcessMutation(typeId, { relations }, contracts, auth, featureForType);
  return {
    ...patch,
    relations: { ...(patch.relations || {}), ...(normalized.relations || {}) }
  };
}

async function assertRelationTargetAvailable(ref, relation = {}, auth = {}, featureForType = null) {
  // A relation entry may accept a union of target types; each stored ref
  // carries its own type, so the ref wins over any singular field.
  const targetTypeId = ref?.type || relation.targetType || [].concat(relation.targetTypes || [])[0];
  const service = getAppRegistry().getInstanceService(targetTypeId);
  const target = await service?.processGetById?.(ref.id, auth);
  if (!target) throw createError({ statusCode: 404, message: `${targetTypeId} relation target not found` });
  const entity = target?.toJSON ? target.toJSON() : target;
  const definition = (getDomain().entities || []).find(item => normalizeTypeId(item.type) === normalizeTypeId(targetTypeId));
  const feature = featureForType?.(targetTypeId)
    || resolveInstanceFeature(definition?.type || targetTypeId);
  assertEntityAccess({
    entity,
    typeId: targetTypeId,
    feature,
    level: 'read',
    action: 'view',
    auth
  });
  // The declared target domain (SPEC §6): the same boolean expression the
  // pickers project — evaluated over the target's stored row exactly like
  // a transition guard, so a value outside the domain is refused at the
  // write boundary whatever offered it.
  if (relation.where && !withinRelationDomain(entity, relation.where)) {
    throw createError({ statusCode: 400, message: `${relation.targetType} ${ref.id} is outside the ${relation.key} domain` });
  }
  if (!ref.revisionId) return;
  const revision = await instanceRevisionsService.getById(ref.revisionId, auth.userId, auth.role, auth);
  const source = revision?.data?.source;
  if (normalizeTypeId(source?.type) !== normalizeTypeId(relation.targetType) || String(source?.id) !== String(ref.id)) {
    throw createError({ statusCode: 400, message: `Pinned revision does not belong to ${relation.targetType} ${ref.id}` });
  }
}

// Relation refs validate against the entry's ACCEPTED types: each stored
// ref carries its own type (a relation entry may accept a union of target
// types), and a type-less wire value defaults to the single accepted type.
function normalizeRelationRef(value, targetTypes = []) {
  const accepted = [].concat(targetTypes || []).filter(Boolean);
  const ref = normalizeInstanceRef(typeof value === 'object' ? value : { type: accepted[0], id: value });
  if (!ref) throw createError({ statusCode: 400, message: 'Relation target must be an instance reference' });
  if (!accepted.some(typeId => normalizeTypeId(ref.type) === normalizeTypeId(typeId))) {
    throw createError({ statusCode: 400, message: `Relation target must be one of ${accepted.join(', ')}` });
  }
  return { ...ref, type: ref.type };
}

async function persistProcessEntityPatch(typeId, targetId, patch, auth) {
  const service = getAppRegistry().getInstanceService(typeId);
  if (!service?.processGetById || !service?.processUpdate) {
    throw createError({ statusCode: 500, message: `Entity service cannot persist process updates for ${typeId}` });
  }
  const entityResult = await service.processGetById(targetId, auth);
  const entity = entityResult?.toJSON ? entityResult.toJSON() : entityResult;
  if (!entity) throw createError({ statusCode: 404, message: `${typeId} not found` });
  assertEntityAccess({
    entity,
    typeId,
    feature: resolveInstanceFeature(typeId),
    level: 'write',
    action: 'update',
    auth
  });
  return await service.processUpdate(targetId, patch, auth);
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

function processDataEnvironment(auth, run, domain = getDomain()) {
  const resolveEntity = (typeId, idOrRef) => resolveProcessGraphEntity(typeId, idOrRef, { auth });
  const queryEntities = (typeId, filters) => queryProcessGraphEntities(typeId, filters, auth);
  return {
    currentEntity: async typeId => {
      const candidate = run.context?.inputs?.entities?.[typeId] || run.context?.inputs?.entity;
      return candidate ? resolveProcessGraphEntity(typeId, candidate, { auth }) : null;
    },
    // Run-context principals (source.currentUser / source.currentOrganization):
    // the acting user and the active organization resolve through the
    // party read adapters like any other party read.
    currentUser: () => resolveEntity('user', auth.userId),
    currentOrganization: () => (auth.organizationId ? resolveEntity('organization', auth.organizationId) : null),
    entityById: (typeId, id) => resolveProcessGraphEntity(typeId, id, { auth }),
    resolveEntityRef: ref => resolveProcessGraphEntity(ref.type, ref, { auth }),
    parentEntity: (entity, typeId) => processParentEntity(domain.containment, resolveEntity, entity, typeId),
    childEntities: (entity, typeId) => processChildEntities(domain.containment, queryEntities, entity, typeId),
    relatedEntities: (entity, relationKey, typeId) => processRelatedEntities(domain.relations, resolveEntity, entity, relationKey, typeId),
    queryEntities: async (typeId, filters = {}) => {
      const service = getAppRegistry().getInstanceService(typeId);
      if (!service?.processList) throw new Error(`Entity service cannot query ${typeId} from a process`);
      return await executeProcessQuery(service.processList, filters, auth);
    },
    valueService: (operatorId, parameters) => invokePreviewValueService(operatorId, parameters, auth),
    // The declared-projection seam (SPEC §8 p extract): the graph's only
    // entity→value dereference beside the reads above. The projection
    // declaration owns the resolve — a stored field path is read here, a
    // handler id is dispatched to the pack mount that bound it.
    projectEntity: async (typeId, projectionId, target) => {
      const contract = domain.projectionContracts?.[`${typeId}/${projectionId}`];
      if (!contract) throw new Error(`No projection ${projectionId} declared on ${typeId}`);
      const id = target && typeof target === 'object'
        ? String(target._id ?? target.id ?? '')
        : String(target ?? '');
      if (!id) throw new Error(`Projection ${projectionId} requires a ${typeId} instance`);
      if (contract.resolve.field) {
        const instance = await resolveProcessGraphEntity(typeId, id, { auth });
        if (!instance) throw new Error(`${typeId} ${id} not found for projection ${projectionId}`);
        return String(contract.resolve.field).split('.').filter(Boolean)
          .reduce((value, key) => value == null ? undefined : value[key], instance);
      }
      // A service resolve dispatches to the installed plugin's
      // endpoint-mode executor: the platform reads the instance and its
      // payload, the service computes the projected value (pure compute
      // over values — the platform carries no plugin code).
      if (contract.resolve.service) {
        return await resolveProjectionValue({
          organizationId: auth.organizationId,
          commandId: String(contract.resolve.service),
          typeId,
          instanceId: id
        });
      }
      const handler = getAppRegistry().getProjectionHandler(contract.resolve.handler);
      if (!handler) throw new Error(`No handler bound for projection ${typeId}/${projectionId}`);
      return await handler({ type: typeId, id, _id: id }, { auth });
    }
  };
}

async function executeDurableEffect(request, auth, run, processData, domain) {
  return await performDurableEffect(request, auth, processData, domain);
}

// The effect boundary receives the entity in every shape the run context
// can produce: a typed ref ({ type, id }) from composed wires, a full DTO
// from reads and in-run effect outputs, or a bare id string from the manual
// action transport (the client posts `instanceId`). The boundary knows the
// effect's typeId, so all three normalize to one typed target.
function effectEntityTarget(value, typeId) {
  const ref = normalizeInstanceRef(value);
  if (ref) return ref;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const id = value._id ?? value.id;
    return id != null && id !== undefined ? { type: typeId, id: String(id) } : null;
  }
  if (typeof value === 'string' && value) return { type: typeId, id: value };
  return null;
}

async function loadProcessEffectEntity(service, typeId, target, auth) {
  if (!service?.processGetById) {
    throw createError({ statusCode: 500, message: `Entity service cannot authorize process writes for ${typeId}` });
  }
  const result = await service.processGetById(target.id, auth);
  const entity = result?.toJSON ? result.toJSON() : result;
  if (!entity) throw createError({ statusCode: 404, message: `${typeId} ${target.id} not found` });
  return entity;
}

export async function performDurableEffect({ kind, record, inputs }, auth, processData = {}, domain = getDomain()) {
  // Species records execute their own kinds here: the durable branches are
  // keyed on the species while the record keeps its discriminator and
  // authored state reference intact.
  const operation = operationKindOf(record || {}) || kind;
  const featureForType = sourceTypeId => {
    const normalized = normalizeTypeId(sourceTypeId);
    const entity = (domain?.entities || []).find(item => item.id === normalized || item.type === normalized);
    const fieldPolicy = getEntityFieldAccessPolicy(normalized);
    return fieldPolicy?.feature || entity?.feature || entity?.collection || resolveInstanceFeature(normalized, domain);
  };
  if (operation === 'cts.emit') {
    const type = String(inputs.type ?? '');
    if (!type) throw new Error('Emit effect requires an event type');
    const event = await persistEvent({
      id: crypto.randomUUID(),
      organizationId: auth.organizationId ?? null,
      type,
      payload: inputs.payload ?? null
    });
    try {
      const { dispatchEventToSubscribers } = await import('./run-scanner.js');
      await dispatchEventToSubscribers(event);
      await markEventDispatched(event._id);
    } catch {
      // The event record persists: the scanner retries delivery.
    }
    return { eventId: event._id, type, at: event.at };
  }
  if (operation === 'cts.command' || operation === 'cts.service') {
    if (!record.commandId) throw new Error('Command effect requires commandId');
    // The command's declared gates ride the execution auth: the action
    // the user authorized owns every command its graph executes.
    const command = getAppRegistry().getCommandDefinition(record.commandId);
    const commandAuth = command
      ? createActionExecutionAuth(auth, {
          ...record,
          typeId: record.typeId || '',
          actionKind: 'runCommand',
          commandId: record.commandId,
          access: command.access
        }, { featureForType })
      : auth;
    const commandResult = await executeCommand(record.commandId, await commandEffectPayload(record.commandId, inputs, auth), commandAuth);
    // The value boundary (SPEC §8 s species): a cts.service's declared
    // output is the handler's value. The command envelope (recording,
    // events, billing) stays in command_runs — spreading it onto the
    // graph would flatten list results into indexed keys.
    return record.kind === 'cts.service' ? (commandResult?.raw ?? commandResult) : commandResult;
  }
  if (operation === 'cts.payload') {
    const typeId = normalizeTypeId(record.typeId || inputs.entity?.type || '');
    if (!typeId) throw new Error('Write payload requires typeId');
    const service = getAppRegistry().getInstanceService(typeId);
    if (!service?.replacePayload) throw new Error(`Entity service missing payload write for ${typeId}`);
    const target = effectEntityTarget(inputs.entity, typeId);
    if (!target?.id) throw new Error('Write payload requires a file instance');
    const envelope = inputs.payload?.payload || inputs.payload || null;
    const base64 = envelope?.base64 || envelope?.payload?.base64 || '';
    if (!base64) throw new Error('Write payload requires a base64 payload');
    const executionAuth = createActionExecutionAuth(auth, {
      ...record,
      typeId,
      actionKind: 'updateEntity',
      access: record.access
    }, { featureForType });
    return await service.replacePayload(target.id, {
      buffer: Buffer.from(String(base64), 'base64'),
      filename: envelope.name || envelope.payload?.name || 'payload',
      mimeType: envelope.mime || envelope.payload?.mime || null
    }, {
      auth: executionAuth,
      userId: auth.userId,
      organizationId: resolveOrganizationId(auth)
    });
  }
  const typeId = normalizeTypeId(record.typeId || inputs.entity?.type || '');
  if (!typeId) throw new Error(`${kind} requires typeId`);
  const service = getAppRegistry().getInstanceService(typeId);
  if (!service) throw new Error(`Entity service missing for ${typeId}`);
  const requiredCapability = operation === 'cts.transition' && record.archiveIntent
    ? 'archive'
    : operation === 'cts.remove' ? 'delete' : null;
  if (requiredCapability && service.processCapabilities?.[requiredCapability] !== true) {
    throw new Error(`${typeId} does not support process ${requiredCapability}`);
  }
  const relationContracts = ['cts.construct', 'cts.mutate'].includes(operation)
    ? processRelationContracts(record, processData, domain)
    : [];
  if (operation === 'cts.construct') {
    const constructionDraft = processConstructionInputRecord(record, inputs, domain);
    let blockDraft = processBlockInputRecord(record, inputs);
    const relationValues = declaredRelationValues(inputs.relations, relationContracts);
    if (Object.keys(relationValues).length) blockDraft = { ...blockDraft, relations: relationValues };
    const organizationId = resolveOrganizationId(auth);
    let declaration = null;
    try {
      declaration = await declarationForType(typeId, organizationId);
    } catch (error) {
      if (error?.statusCode !== 404 && !String(error?.message || '').includes(`Unknown type ${typeId}`)) throw error;
    }
    const domainEntity = (domain?.entities || []).find(entity => entity.id === normalizeTypeId(typeId) || entity.type === normalizeTypeId(typeId));
    // Some framework pack entities are projected into the process domain
    // before they have an org CTS declaration. They still use the same
    // collection-level write gate; only declared inheritance needs the CTS
    // declaration path.
    const writeTarget = declaration
      ? await writeGrantTarget(declaration, organizationId)
      : domainEntity
        ? {
            typeId: normalizeTypeId(typeId),
            feature: domainEntity.feature || domainEntity.collection || resolveInstanceFeature(typeId, domain)
          }
        : null;
    if (!writeTarget) throw createError({ statusCode: 404, message: `Unknown type ${typeId}` });
    // A construct is a create write, not merely an assigned action. Its
    // request-local grant must pass the same create/action-level gate as
    // every other instance writer before construction work or persistence.
    const actionForAuth = {
      ...record,
      typeId: writeTarget.typeId,
      construction: {
        ...(record.construction || {}),
        inputs: effectConstructionInputs(record, domain)
      }
    };
    const executionAuth = createActionExecutionAuth(auth, actionForAuth, {
      relationContracts,
      featureForType,
      featureOverride: writeTarget.feature
    });
    assertEntityAccess({
      entity: { organizationId },
      typeId: writeTarget.typeId,
      feature: writeTarget.feature,
      level: 'write',
      action: 'create',
      auth: executionAuth
    });
    // Relation values arrive on two channels — the block socket and the
    // construct-addressable `relations.*` construction inputs — and both
    // normalize through the same declared-edge contract, so the stored
    // shape is the declared cardinality whichever channel carried it.
    blockDraft = await normalizeProcessMutation(typeId, { ...blockDraft, ...constructionDraft }, relationContracts, executionAuth, featureForType);
    let targetState = inputs.state ?? inputs['states.main']
      ?? (Object.hasOwn(record.inputDefaults || {}, 'state') ? String(authoredSocketDefault(record.inputDefaults.state)) : undefined)
      ?? (Object.hasOwn(record.inputDefaults || {}, 'states.main') ? processDefaultValue(record.inputDefaults['states.main']) : undefined)
      ?? record.state?.to;
    if (targetState == null && record.producerOutputId) {
      // A machine requires an authored entry (SPEC §7): when the construct
      // authored no state default, the compiled machine's initial is that
      // entry, and creation stamps it. A type with no machine stays
      // stateless — no status is invented.
      const machine = await workflowOverridesService.resolveActiveWorkflow({
        typeId,
        organizationId: resolveOrganizationId(auth),
        producerOutputId: record.producerOutputId
      });
      const region = machine?.regions?.[machine.primaryRegion] || Object.values(machine?.regions || {})[0];
      targetState = region?.initial || null;
    }
    const draft = {
      ...blockDraft,
      // §3/§8 causal record: the effect boundary stamps provenance on
      // every process-constructed instance — op names the node and its
      // construction mode, sources collect the typed entity inputs plus
      // the run-context entity, effective carries the resolved parameters
      // (the conversion's replay-safety inputs).
      provenance: constructProvenance(record, constructionDraft, targetState, inputs)
    };
    const stateMetadata = draft.states?.metadata && typeof draft.states.metadata === 'object'
      ? draft.states.metadata
      : {};
    delete draft.states;
    const mode = record.construction?.mode || '';
    const handler = service.constructionHandlers?.[mode];
    if (typeof handler !== 'function') {
      throw new Error(`No registered handler for construction mode ${mode || '(none)'} on ${typeId}`);
    }
    const created = await handler(draft, {
      userId: auth.userId,
      organizationId,
      role: auth.role,
      executionAuth,
      applyTypedBlocks: result => applyTypedConstructionBlocks(record, blockDraft, result, service, executionAuth, writeTarget.feature)
    });
    const dto = created?.toJSON ? created.toJSON() : created;
    const targetId = instanceId(dto);
    const result = targetState && targetId
      ? {
          ...dto,
          status: await stateService.setInitialStateForOrganization(
            typeId,
            targetId,
            targetState,
            organizationId,
            auth.userId,
            {
              source: { kind: 'process-run', ...(record.id ? { actionId: record.id } : {}) },
              ...stateMetadata,
              ...processStatusMetadata(record, `Created by process effect ${record.id}`, processData)
            }
          )
        }
      : dto;
    await publishActionEntityEvent(auth, typeId, result, 'created', 'process-create');
    return result;
  }
  const target = effectEntityTarget(inputs.entity, typeId);
  if (!target?.id) throw new Error(`${kind} requires an entity reference`);
  if (operation === 'cts.mutate') {
    const executionAuth = createActionExecutionAuth(auth, { ...record, actionKind: 'updateEntity' }, { relationContracts, featureForType });
    const entity = await loadProcessEffectEntity(service, typeId, target, executionAuth);
    assertEntityAccess({
      entity,
      typeId,
      feature: featureForType(typeId),
      level: 'write',
      action: 'update',
      auth: executionAuth
    });
    // Field schemas resolve against the projected view first — org/pack
    // types live there; legacy types not in the view keep the legacy
    // tables until their surfaces are deleted.
    const projectedFieldSchemas = (await getProjectedDomain(resolveOrganizationId(auth)))
      .fieldSchemas?.[typeId];
    const schemas = projectedFieldSchemas || getEntityFieldSchemas(record.typeId);
    const persistedChanges = processBlockInputChanges(record, inputs, schemas);
    const statusValue = inputs.state
      ?? (Object.hasOwn(record.inputDefaults || {}, 'state') ? String(authoredSocketDefault(record.inputDefaults.state)) : null);
    const statusChange = statusValue == null ? null : {
      path: 'states.main',
      operation: 'set',
      value: statusValue
    };
    if (statusChange) {
      const patch = wirePatchFromChanges(persistedChanges);
      const relationValues = declaredRelationValues(inputs.relations, relationContracts);
      if (Object.keys(relationValues).length) patch.relations = { ...(patch.relations || {}), ...relationValues };
      const normalizedPatch = await normalizeProcessPatchRelations(typeId, patch, relationContracts, executionAuth, featureForType);
      const result = await stateService.transitionWithResult({
        typeId,
        targetId: target.id,
        targetState: typeof statusChange.value === 'string' ? statusChange.value : statusChange.value?.id,
        auth: executionAuth,
        context: effectTransitionContext(record, inputs),
        patch: Object.keys(normalizedPatch).length ? normalizedPatch : null
      });
      return result.entity;
    }
    const patch = wirePatchFromChanges(persistedChanges);
    const relationValues = declaredRelationValues(inputs.relations, relationContracts);
    if (Object.keys(relationValues).length) patch.relations = { ...(patch.relations || {}), ...relationValues };
    const normalizedPatch = await normalizeProcessPatchRelations(typeId, patch, relationContracts, executionAuth, featureForType);
    if (!service.processUpdate) throw new Error(`Entity service cannot update ${typeId}`);
    return await service.processUpdate(target.id, normalizedPatch, executionAuth);
  }
  if (operation === 'cts.transition' && record.archiveIntent) {
    const result = await stateService.transitionWithResult({
      typeId,
      targetId: target.id,
      intent: record.archiveIntent,
      auth,
      context: effectTransitionContext(record, inputs)
    });
    return result.entity;
  }
  if (operation === 'cts.transition') {
    // The declared target rides the state socket (the wire is the value) or
    // the record's authored state reference; an authored socket default is
    // equivalent.
    const authoredTargetDefault = record.inputDefaults
      ? (typeof record.inputDefaults.state === 'string' ? record.inputDefaults.state : undefined)
      : undefined;
    const targetState = typeof inputs.state === 'string'
      ? inputs.state
      : (inputs.state?.id ?? record.state?.to ?? authoredTargetDefault);
    if (targetState == null) {
      // Activation refuses target-less transitions (graph-protocol binding
      // check); reaching here means the ACTIVE definition predates the
      // authored target — name the node and the remedy.
      throw new Error(
        `transition ${record.id || '(unnamed)'} declares no target state — author the target in the process designer and re-activate the process (actions execute the activated definition, not the draft)`
      );
    }
    const result = await stateService.transitionWithResult({
      typeId,
      targetId: target.id,
      targetState,
      auth,
      context: effectTransitionContext(record, inputs)
    });
    return result.entity;
  }
  if (operation === 'cts.remove') {
    if (!service.processDelete) throw new Error(`Entity service cannot delete ${typeId}`);
    const executionAuth = createActionExecutionAuth(auth, { ...record, actionKind: 'deleteEntity' }, { featureForType });
    const entity = await loadProcessEffectEntity(service, typeId, target, executionAuth);
    assertEntityAccess({
      entity,
      typeId,
      feature: featureForType(typeId),
      level: 'write',
      action: 'delete',
      auth: executionAuth
    });
    const deleted = await service.processDelete(target.id, executionAuth);
    await publishActionEntityEvent(executionAuth, typeId, { _id: target.id }, 'deleted', 'process-delete');
    return deleted;
  }
  throw new Error(`Unsupported process effect ${kind}`);
}

function actorIdOf(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value || null;
  if (typeof value === 'object') return value.userId || value.id || value._id || null;
  return null;
}

// Actor assignment (SPEC §7): the transition's actors value (wire or
// authored socket default) becomes the instance's actor set — ownership,
// applying to every state.
function transitionActorEntries(record = {}, inputs = {}) {
  const values = [].concat(inputs.actors ?? []).filter(Boolean);
  return values
    .map(actorIdOf)
    .filter(Boolean)
    .map(userId => ({ userId: String(userId) }));
}

export function effectTransitionContext(record = {}, inputs = {}) {
  const note = inputs.note ?? record.note;
  const actors = transitionActorEntries(record, inputs);
  return {
    source: { kind: 'process-run', ...(record.id ? { actionId: record.id } : {}) },
    ...(record.state?.axis ? { region: record.state.axis } : {}),
    ...(record.producerOutputId ? { producerOutputId: record.producerOutputId } : {}),
    ...(note != null && note !== '' ? { metadata: { note: String(note) } } : {}),
    ...(actors.length ? { lifecycle: { actors } } : {})
  };
}

async function applyTypedConstructionBlocks(record = {}, blockDraft = {}, created = null, service = null, auth = {}, feature = null) {
  if (!created || !Object.keys(blockDraft).length) return created;
  if (!service?.processUpdate) throw new Error(`Entity service cannot apply constructed blocks to ${record.typeId}`);
  const targetId = created._id || created.id;
  if (!targetId) throw new Error(`Created ${record.typeId} has no id`);
  const createdEntity = created?.toJSON ? created.toJSON() : created;
  // A construct action's grant is deliberately create-only. Applying its
  // typed block values is a separate update operation on the newly created
  // entity, so derive that narrowly at this internal boundary rather than
  // widening every construct action's execution grant.
  const updateAuth = createActionExecutionAuth(auth, {
    ...record,
    actionKind: 'updateEntity'
  }, { featureOverride: feature || resolveInstanceFeature(record.typeId) });
  assertEntityAccess({
    entity: createdEntity,
    typeId: record.typeId,
    feature: feature || resolveInstanceFeature(record.typeId),
    level: 'write',
    action: 'update',
    auth: updateAuth
  });
  const patch = Object.fromEntries(Object.entries(blockDraft).map(([block, value]) => [
    block,
    { ...(created[block] || {}), ...(value || {}) }
  ]));
  return await service.processUpdate(targetId, patch, updateAuth);
}

async function commandEffectPayload(commandId, inputs = {}, auth = {}) {
  let command = getAppRegistry().getCommandDefinition(commandId);
  if (!command) {
    // Plugin connector services declare their command on the install
    // snapshot; the registry stays static (the commands-runtime law).
    const { commandDefinitionFor } = await import('../plugins/service.js');
    command = await commandDefinitionFor(commandId, auth);
  }
  if (!command) throw new Error(`Unknown command: ${commandId}`);
  // A plugin connector's input is its value signature: the service
  // sockets travel as parameters straight to the endpoint, unwrapped
  // from their data packets.
  if (command.plugin) {
    const parameters = {};
    for (const [id, value] of Object.entries(inputs)) {
      if (id === 'in') continue;
      parameters[id] = isDataTree(value) ? packetValue(value) : value;
    }
    return { parameters };
  }
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
      const ref = normalizeInstanceRef(value) || (value?.id || value?._id ? { type: input.typeId, id: value.id || value._id } : null);
      if (ref) addSource(ref.type || input.typeId, ref.id);
    }
  }
  const contextRef = normalizeInstanceRef(inputs.entity || null);
  if (contextRef) addSource(contextRef.type, contextRef.id);
  const effective = { via: mode || 'genericCreate' };
  if (targetState) effective.targetState = targetState;
  const parameters = Object.fromEntries(Object.entries(constructionDraft || {})
    .filter(([, value]) => value !== undefined && value !== null));
  if (Object.keys(parameters).length) effective.parameters = parameters;
  return {
    op: `${record.kind || 'cts.construct'}:${record.id}${mode ? `:${mode}` : ''}`,
    sources,
    effective
  };
}

export function processConstructionInputRecord(record = {}, inputs = {}, domain = getDomain()) {
  const result = {};
  for (const input of effectConstructionInputs(record, domain)) {
    const id = input.id || input.path;
    if (!id) continue;
    const supplied = Object.hasOwn(inputs, id) ? inputs[id] : input.default;
    if (supplied === undefined) continue;
    const value = input.type === 'entity'
      ? entityInputId(supplied)
      : input.type === 'typeList'
        // A relation input preserves a supplied ref's own type: a
        // relation edge may accept several target types, and the write
        // resolves the contract per ref. Bare ids stay bare (the
        // single-target spelling).
        ? (Array.isArray(supplied) ? supplied : [supplied]).map(relationInputValue).filter(Boolean)
        : supplied;
    setByPath(result, input.path || id, value);
  }
  return result;
}

// Construction-inputs law: README §Action execution seam (Create).
function effectConstructionInputs(record = {}, domain = {}) {
  const authored = Array.isArray(record.construction?.inputs) ? record.construction.inputs : [];
  const contract = domain.construction?.[normalizeTypeId(record.typeId || '')] || null;
  if (!contract) return authored;
  const derived = constructionInputsForContract(contract, resolveConstructionMode(record, contract));
  if (!derived.length) return authored;
  const authoredById = new Map(authored.map(input => [input.id || input.path, input]));
  const merged = derived.map(input => {
    const override = authoredById.get(input.id || input.path);
    return override ? { ...input, ...override } : input;
  });
  const mergedIds = new Set(merged.map(input => input.id || input.path));
  return [...merged, ...authored.filter(input => !mergedIds.has(input.id || input.path))];
}

function relationInputValue(supplied) {
  if (supplied && typeof supplied === 'object' && (supplied.type || supplied.typeId)) {
    return {
      type: supplied.type || supplied.typeId,
      id: String(supplied.id ?? supplied._id ?? ''),
      ...(supplied.spot != null ? { spot: String(supplied.spot) } : {})
    };
  }
  const id = entityInputId(supplied);
  if (id == null) return null;
  // A spot assignment (SPEC §24 spot-parts) rides beside the id: the
  // explicit anchor pairing survives the construction-input scalarize.
  if (supplied && typeof supplied === 'object' && supplied.spot != null) {
    return { id, spot: String(supplied.spot) };
  }
  return id;
}

// Field sockets spell row paths as `fields.<path>` (the catalog's socket
// vocabulary — inputDefaults, compiled mutation.fields, the manifest's
// input policy); the row/schema layer and stored patches speak the bare
// Effect inputs arrive as data packets (the orchestration's one wire
// shape); a stored patch speaks scalars. Unwrap once, here.
function unwrapEffectInput(value, field = {}) {
    if (!isDataTree(value)) return value;
    return packetValue(value, field.type?.base === 'array' ? 'list' : 'item');
}

// The instance wire speaks NESTED blocks (`fields.done` travels as
// patch.fields.done); a dotted key matches no block branch. One
// conversion home for every patch the process seam builds.
function wirePatchFromChanges(changes = []) {
  const patch = {};
  const write = (segments, value) => {
    let node = patch;
    while (segments.length > 1) {
      const key = segments.shift();
      if (typeof node[key] !== 'object' || node[key] === null) node[key] = {};
      node = node[key];
    }
    node[segments[0]] = value;
  };
  for (const change of changes) {
    if ((change.operation || 'set') !== 'set') throw new Error(`Persisted entity updates support set values only`);
    write(String(change.path).split('.').filter(Boolean), change.value);
  }
  return patch;
}

function processBlockInputChanges(record = {}, inputs = {}, schemas = null) {  const fieldSchemas = schemas || getEntityFieldSchemas(record.typeId);
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
      value: normalizeBlockFieldValue(field, unwrapEffectInput(inputs[field.path], field))
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
          value: normalizeBlockFieldValue(field, unwrapEffectInput(fieldValue, field))
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
  if (!membership || membership.status !== 'active') return false;
  if (hasPermissionGrant({ permissions: membership.permissions || {}, feature: 'organizations', level })) return true;
  return false;
}

function findOrganizationMembership(auth = {}, organizationId) {
  const target = organizationId?.toString();
  return (auth.memberships || []).find(item => item.organizationId?.toString() === target);
}

function getDomain() {
  return { commands: {}, construction: {}, events: [], serviceContracts: {} };
}

/**
 * The shared gesture grammar for headless composition and editing: applies
 * designer gestures — the same seam the designer shell drives, with the
 * same legality gates — in order. The first failing gesture stops with its
 * gate message; the grammar mirrors the seam one-to-one.
 */
// Gestures address things by id: a step without its required fields must
// fail with the missing field's name, not a downstream seam collision
// (an omitted id on two declarations collides on the empty key and reads
// as "Declaration already exists" — a nonsense teacher for a model).
const STEP_REQUIRED_FIELDS = {
  declareClass: ['id', 'typeId', 'name'],
  declareTypeRef: ['id', 'typeId'],
  declareField: ['id', 'ownerClassId', 'name'],
  declareState: ['id', 'value'],
  wireDeclaration: ['from', 'to', 'role'],
  unwireDeclaration: ['from', 'to', 'role'],
  drop: ['item'],
  configure: ['id'],
  setInputDefault: ['id', 'input'],
  connect: ['id', 'fromPort', 'to', 'toPort'],
  disconnect: ['id', 'fromPort', 'to', 'toPort'],
  removeNode: ['id']
};

const DECLARATION_STEP_OPS = new Set(['declareClass', 'declareTypeRef', 'declareField', 'declareState', 'wireDeclaration', 'unwireDeclaration']);

/**
 * The headless step runner shared by compose and edit (exported for the
 * seam specs): applies gestures in order, re-seating the session onto
 * the draft-overlay domain after every declaration step so the tree's
 * own declarations resolve as ports immediately.
 */
export function applyAuthoringSteps(authoring, steps = [], domain = null) {
  const list = Array.isArray(steps) ? steps : [];
  for (const [index, step] of list.entries()) {
    const op = String(step?.op || '');
    const id = String(step?.id || '');
    for (const field of STEP_REQUIRED_FIELDS[op] || []) {
      if (!String(step?.[field] ?? '').trim()) {
        throw createError({ statusCode: 400, message: `Step ${index + 1} (${op}) failed: ${field} is required` });
      }
    }
    try {
      if (op === 'declareClass') {
        authoring.declareClass({ id, typeId: String(step.typeId || ''), name: step.name, class: step.class });
      } else if (op === 'declareTypeRef') {
        authoring.declareTypeRef({ id, typeId: String(step.typeId || '') });
      } else if (op === 'declareField') {
        authoring.declareField({ id, ownerClassId: String(step.ownerClassId || ''), name: step.name, descriptor: step.descriptor });
      } else if (op === 'declareState') {
        authoring.declareState({
          id,
          ownerClassId: String(step.ownerClassId || ''),
          typeId: String(step.typeId || ''),
          value: step.value,
          initial: step.initial === true,
          terminal: step.terminal === true
        });
      } else if (op === 'wireDeclaration') {
        authoring.wireDeclaration(String(step.from || ''), String(step.to || ''), String(step.role || ''));
      } else if (op === 'unwireDeclaration') {
        authoring.unwireDeclaration(String(step.from || ''), String(step.to || ''), String(step.role || ''));
      } else if (op === 'drop') {
        authoring.drop(String(step.item || ''), { id });
      } else if (op === 'configure') {
        authoring.configure(id, step.values && typeof step.values === 'object' ? step.values : {});
      } else if (op === 'setInputDefault') {
        authoring.setInputDefault(id, String(step.input || ''), step.value ?? null);
      } else if (op === 'connect') {
        authoring.connect(id, String(step.fromPort || ''), String(step.to || ''), String(step.toPort || ''));
      } else if (op === 'disconnect') {
        authoring.disconnect(id, String(step.fromPort || ''), String(step.to || ''), String(step.toPort || ''));
      } else if (op === 'removeNode') {
        authoring.removeNode(id);
      } else {
        throw new Error(`Unknown authoring step: ${op || '(none)'}`);
      }
    } catch (error) {
      let message = `Step ${index + 1} (${op}) failed: ${error?.message || error}`;
      // A bare `Unknown port` hides its cause: the port set derives from
      // the draft-overlay domain, and a skipped or fieldless declaration
      // there is the usual reason. Name it in the same breath — the
      // caller (agent or designer) gets the cause and the next action,
      // not a wall.
      if (/^Unknown port/.test(String(error?.message || '')) && domain) {
        const report = [];
        declarationOverlayDomain(authoring.definition(), domain, { report });
        const summary = [
          ...report.filter(entry => entry.typeId).map(entry => (
            entry.skipped ? `${entry.typeId} skipped: ${entry.skipped}` : `${entry.typeId}(${entry.fields} fields)`
          )),
          ...report.map(entry => entry.note).filter(Boolean)
        ];
        if (summary.length) message += ` — draft overlay: ${summary.join('; ')}`;
        else message += ' — the draft declares no types: the port set falls back to the applied registry';
      }
      throw createError({ statusCode: 400, message });
    }
    // Declaration steps re-seat the seam onto the draft-overlay domain:
    // the tree's own declarations become ports immediately, so a field
    // declares and wires in ONE session.
    if (domain && DECLARATION_STEP_OPS.has(op)) {
      authoring.withDomain(declarationOverlayDomain(authoring.definition(), domain));
    }
  }
}

/**
 * Headless composition (agent authoring): applies the designer's own
 * gestures — the same seam the designer shell drives, with the same
 * legality gates — in order onto a fresh document and persists the
 * draft.
 */
export async function composeDefinition({ name = '', steps = [] } = {}, auth) {
  const organizationId = resolveOrganizationId(auth);
  await assertOrgAccess(auth, organizationId, 'write');
  const domain = await getProjectedDomain(organizationId);
  const authoring = createDefinitionAuthoring(domain);
  applyAuthoringSteps(authoring, steps, domain);
  return await create({ name, data: authoring.definition() }, auth);
}

/**
 * Declares the Apply status-migration decision on a definition — the
 * authored `data.migrations.statuses` the activation gate reads (the
 * migration-plan contract) — through a server-side merge: no
 * whole-document echo from the caller. The list replaces the stored
 * declaration (stale rows are no-ops by contract); an empty list clears
 * it back to the historical 409 gate. Coverage is validated at
 * activation, where the recomputed plan rides the 400.
 */
export async function declareStatusMappings({ definitionId = '', mappings = [] } = {}, auth) {
  const id = String(definitionId || '');
  if (!id) throw createError({ statusCode: 400, message: 'definitionId is required' });
  if (!Array.isArray(mappings)) {
    throw createError({ statusCode: 400, message: 'mappings must be an array of { typeId, from, to }' });
  }
  const stored = await getById(id, auth);
  const declared = normalizeStatusMappings(mappings);
  const data = { ...(stored?.data || {}) };
  if (declared.length) {
    data.migrations = { ...(data.migrations || {}), statuses: declared };
  } else if (data.migrations) {
    data.migrations = { ...data.migrations };
    delete data.migrations.statuses;
  }
  await update(id, { data }, auth);
  return { definitionId: id, declared };
}

/**
 * Headless editing (agent authoring): the same gesture grammar as
 * composeDefinition, applied to an EXISTING definition's stored authored
 * document. Small payloads in, legality gates enforced, no whole-graph
 * echo from the caller. Server-owned activation records (history,
 * activated) are preserved; `compiled` is dropped by the update seam as
 * on every save.
 */
export async function editDefinition({ definitionId = '', steps = [] } = {}, auth) {
  const id = String(definitionId || '');
  const stored = await getById(id, auth);
  const storedData = authoredProcessData(stored?.data || {});
  const organizationId = resolveOrganizationId(auth);
  await assertOrgAccess(auth, organizationId, 'write');
  const domain = await getProjectedDomain(organizationId);
  const authoring = createDefinitionAuthoring(domain, null, storedData);
  // Stored-but-unapplied declarations resolve as ports from the first
  // step: the seam starts on the draft-overlay domain, not the raw
  // projection (an edited-in-a-later-session field wired the same wall
  // otherwise).
  authoring.withDomain(declarationOverlayDomain(storedData, domain));
  applyAuthoringSteps(authoring, steps, domain);
  const data = authoring.definition();
  for (const key of ['history', 'activated']) {
    if (storedData?.[key] !== undefined) data[key] = storedData[key];
  }
  return await update(id, { data }, auth);
}

/**
 * The designer Apply's declaration step, server-side: compiles the
 * draft's in-tree declaration tree (classes, fields, states, and their
 * wires) and posts each declaration into the organization's type
 * registry through the cts-types boundary — the same posts the
 * designer's APPLY makes before it activates. Required before
 * activation whenever the draft declares types in-tree: validation
 * overlays the draft's own declarations, the activation compile
 * resolves types against the registry. A registry refusal (breaking
 * diff, SPEC §11) returns as a structured per-type failure; posts are
 * idempotent re-posts on retry.
 */
export async function applyTreeDeclarations(id, auth) {
  const process = await loadAuthorized(id, auth, 'write');
  const data = authoredProcessData(process.data);
  const graph = data.graph || {};
  const { declarations, diagnostics } = compileTreeDeclarations(
    graph.nodes || [],
    graph.edges || [],
    data.processNodes || {}
  );
  if (diagnostics.length) {
    throw createError({ statusCode: 400, message: `Declaration errors: ${diagnostics.join('; ')}` });
  }
  const applied = [];
  const failures = [];
  for (const declaration of declarations) {
    try {
      await defineType(declaration, {
        organizationId: process.lineage.organizationId,
        actor: auth.userId
      });
      applied.push(String(declaration.id));
    } catch (error) {
      failures.push({ typeId: String(declaration.id), message: error?.message || String(error) });
    }
  }
  return { applied, failures };
}

// The mode list compile accepts (compiler-adapter contractModes); the
// agent vocabulary serves it.
export async function listConstructionModes(organizationId = null) {
  const domain = await getProjectedDomain(organizationId);
  return Object.fromEntries(Object.entries(domain.construction || {})
    .map(([typeId, row]) => [typeId, { modes: row.modes, defaultMode: row.defaultMode }]));
}

// The compiler consumes the CTS-projected domain: strangler-converted system
// declarations plus the organization's authored types (cts_types). A broken
// stored type fails loudly here.
async function getProjectedDomain(organizationId = null) {
  const registry = await compileRegistryForOrganization(organizationId);
  return projectDomainFromView(registry, organizationId, await projectedDomainsForOrganization(organizationId), {
    packServices: await projectedServicesForOrganization(organizationId)
  });
}

// The rewrites that PERSIST: producer-identity migration and the retired
// Name-input surgery apply to the authored data itself (pre-protocol
// records only for identities; cts records carry their identities from the
// designer). Protocol acceptance runs on a lowered copy.
function persistedRewrites(data, domain) {
  const identity = migrateProducerOutputIdentities(data, domain);
  if (identity.errors.length) {
    throw createError({ statusCode: 400, message: identity.errors.join('; '), data: { errors: identity.errors } });
  }
  assertCurrentProcessDefinition(identity.data);
  tryAcceptGraphProtocol(identity.data, domain);
  return retireStateScopeAuthoring(rewriteRetiredWirePaths(orientChildrenEdgesChildFirst(collapseEffectAccessGrants(identity.data))));
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
  const service = getAppRegistry().getInstanceService('organization');
  if (!service?.getProcessConfiguration) {
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
  const fields = projection.fields?.length ? projection.fields : ['name', 'state'];
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
