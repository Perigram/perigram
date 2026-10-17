import { createError } from 'h3';
import standardSlugify from 'standard-slugify';
import { ObjectId } from 'mongodb';
import { normalizeInstanceRef } from '~/packages/core/src/index.js';
import { assertEntityAccess } from '~/server/core/access/service.js';
import { executeCommand } from '~/server/core/commands/service.js';
import { createStatusState } from '~/server/core/blocks/index.js';
import { stateService } from '~/server/core/machines/service.js';
import * as workflowOverridesService from '../workflow-overrides/service.js';
import * as instanceRevisionsService from '~/server/features/instance-revisions/service.js';
import * as entityEventService from '~/server/features/instance-events/service.js';
import { getAppRegistry } from '~/server/runtime/app-registry.js';
import { normalizeTypeId } from '~/server/runtime/entities.js';
import { findTypeDeathCandidates, killTypesWithData, typeDeathManifest } from '../cts-types/lifetime.js';
import {
  compileProcessDefinition,
  constructionInputsForContract,
  diffProcessContracts,
  hasCanonicalProcessSource,
  normalizeProcessDefinition,
  PROCESS_DATAFLOW_VERSION,
  previewProcessDataflow,
  resolveConstructionMode,
  resumeProcessRun,
  serializeProcessResult,
  validateRoundTrip,
  authoredSocketDefault,
  isDataTree,
  packetValue
} from '~/packages/processes/src/index.js';
import { createDefinitionAuthoring, graphIntegrityProblems } from '~/packages/processes/src/authoring.js';
import {
  getBlockFieldSchema,
  getBlockFieldSchemas,
  getEntityFieldSchema,
  getEntityFieldSchemas
} from './system-view.js';
import { getEntityFieldAccessPolicy } from '~/shared/field-access-policies.js';
import { getPerigramRegistry } from '~/server/runtime/perigram-registry.js';
import { toFlexibleId } from '~/server/utils/objectid.js';
import { hasPermissionGrant, normalizePermissionGrants } from '#shared/access-control.js';
import { ProcessDefinition } from './model.js';
import * as repository from './repository.js';
import { normalizeLegacyProcessActions } from './action-migration.js';
import { compileActiveProcessRuntime, getActiveMergedDataForOrganization } from './runtime.js';
import { compileRegistryForOrganization } from '../cts-types/service.js';
import { ensureInstanceIndexes } from '../instances/indexes.js';
import { publishOrgContractChanged } from '../instance-events/service.js';
import { operationKindOf, projectDomainFromView, orientChildrenEdgesChildFirst, rewriteRetiredWirePaths } from '~/packages/cts/src/index.js';
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
 * snapshots only — auth decisions always recompile and never read this
 * path. Consumers: agent bot wake-rule pickers.
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

function definitionReferencesType(data = {}, typeId) {
  if (Object.values(data.processNodes || {}).some(node => node?.typeId === typeId)) return true;
  if (Object.values(data.screens || {}).some(screen => screen?.typeId === typeId)) return true;
  return Object.values(data.ctsTypes || {})
    .some(decl => Object.values(decl?.edges?.children || {})
      .some(edge => (edge?.types || []).includes(typeId)));
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

// The save floor: a persisted graph is structurally sound — nodes carry a
// unique id, a type, and a numeric position; edges address existing nodes.
// Semantic validity stays the validator's job (drafts may fail it
// mid-edit); integrity never saves.
function assertGraphIntegrity(data) {
  if (!data || typeof data !== 'object' || !data.graph) return;
  const problems = graphIntegrityProblems(data.graph);
  if (problems.length) {
    throw createError({ statusCode: 400, message: `Graph integrity: ${problems.slice(0, 5).join('; ')}` });
  }
}

export async function create(payload = {}, auth) {
  const organizationId = payload.organizationId || resolveOrganizationId(auth);
  await assertOrgAccess(auth, organizationId, 'write');
  const name = payload.name || payload.identity?.name || 'Organization process';
  // Authored data persists in its own vocabulary (graph protocol v5 stays
  // v5): the persisted producer-identity rewrite runs on it, and protocol
  // acceptance (v5 lowering + binding checks) validates a copy.
  const domain = await getProjectedDomain(organizationId);
  assertGraphIntegrity(payload.data || payload);
  const authored = persistedRewrites(structuredClone(payload.data || payload), domain);
  const process = new ProcessDefinition({
    identity: {
      uid: `process-${new ObjectId().toString()}`,
      name,
      slug: standardSlugify(name, { keepCase: false })
    },
    lineage: { organizationId: toFlexibleId(organizationId) },
    data: authored
  });
  applyProcessState(process, 'DRAFT', auth.userId, 'Process draft created');
  const created = await repository.create(process);
  return new ProcessDefinition(created).toJSON();
}

export async function update(id, payload = {}, auth) {
  const process = await loadAuthorized(id, auth, 'write');
  const renaming = payload.identity?.name || payload.name;
  // An identity-only PATCH never touches data (the rename path).
  if (renaming && !payload.data) {
    process.identity.name = renaming;
    return new ProcessDefinition(await repository.updateById(id, process)).toJSON();
  }
  // One document for its whole life: data edits save in place, draft or
  // active — re-activation records the superseded graph in data.history.
  if (renaming) process.identity.name = renaming;
  assertGraphIntegrity(payload.data);
  const domain = await getProjectedDomain(process.lineage.organizationId);
  const authored = persistedRewrites(structuredClone(payload.data), domain);
  process.data = authored;
  process.data.compiled = null;
  const updated = await repository.updateById(id, process);
  return new ProcessDefinition(updated).toJSON();
}

// The semantic Apply diff recomputes both sides from the canonical authored
// definitions instead of trusting the stored `compiled` snapshot (which is
// inspection-only). The baseline is the MERGED contract of the OTHER active
// definitions; returns null when there are none or the previous contract
// can no longer be compiled for comparison.
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
      const nextCompiled = await compileOrganizationProcess(process.data, process.lineage.organizationId, await loadOrganizationRoles(process.lineage.organizationId));
      const stranded = await collectStrandedInstanceStatees(process, auth, nextCompiled);
      if (stranded.length) migrationPlan = buildStatusMigrationPlan(stranded, nextCompiled);
    } catch {
      // The activate boundary recomputes the plan from fresh compiles; a
      // failed plan build here must not mask the validation result.
    }
  }
  return { ...validation, diff, ...(migrationPlan ? { migrationPlan } : {}) };
}

export async function activate(id, auth, { confirmTypeDeath = false } = {}) {
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
  // Type lifetime (cts SPEC §4, owner decision 2026-10-13): the apply that
  // orphans a type kills it WITH its data — never without the author's
  // confirmed consent. The stored set (this definition's draft included,
  // saved by the preceding save) is the declaring set.
  const deathCandidates = await findTypeDeathCandidates({ organizationId: process.lineage.organizationId });
  if (deathCandidates.length) {
    const typeDeath = await typeDeathManifest(deathCandidates, process.lineage.organizationId);
    if (!confirmTypeDeath) {
      throw createError({
        statusCode: 409,
        message: `This apply orphans ${typeDeath.length} type(s) no stored definition declares — they and their data will be deleted`,
        data: { typeDeath }
      });
    }
    await killTypesWithData(typeDeath, { organizationId: process.lineage.organizationId, actor: auth.userId });
  }
  process.data = {
    ...process.data,
    compiled: await compileOrganizationProcess(process.data, process.lineage.organizationId, roles)
  };
  // The gate and the migration both resolve against the NEXT merged
  // contract — this definition atop the other actives — so states owned
  // by other active definitions are never falsely stranded.
  const mergedNext = await compileActiveProcessRuntime(
    mergeActiveDefinitions([
      ...(await repository.findActiveSetByOrganization(process.lineage.organizationId))
        .filter(active => String(active._id) !== String(process._id))
        .map(active => active.data.activated || active.data),
      process.data
    ]),
    roles,
    process.lineage.organizationId
  );
  const stranded = mergedNext ? await collectStrandedInstanceStatees(process, auth, mergedNext) : [];
  const plan = stranded.length ? buildStatusMigrationPlan(stranded, mergedNext) : null;
  // Version record (feature README): re-activating an already-active
  // definition preserves the superseded authored snapshot in data.history
  // before the new graph activates.
  if (process.status?.state?.primary === 'ACTIVE') {
    const history = [...(process.data.history || []), {
      at: new Date().toISOString(),
      actor: auth.userId || 'SYSTEM',
      data: { ...process.data, history: undefined, compiled: undefined, activated: undefined }
    }];
    process.data.history = history.slice(-50);
  }
  // The migration decision is a declaration on the definition
  // (data.migrations.statuses), not an activate-time payload: activation
  // reads what the organization authored. Stale declared rows are no-ops
  // (migration-plan contract); every plan row must be covered.
  const mappings = normalizeStatusMappings(process.data?.migrations?.statuses);
  if (stranded.length) {
    if (!mappings.length) throwMigrationRequired(stranded, plan);
    const mappingErrors = validateStatusMappings(plan, mappings);
    if (mappingErrors.length) {
      throw createError({ statusCode: 400, message: mappingErrors.join('; '), data: { migrationPlan: plan } });
    }
  }
  applyProcessState(process, 'ACTIVE', auth.userId, 'Process activated');
  // The runtime source for an active-set member is the snapshot that
  // activation published (feature README): edits accumulate as draft
  // data and go live only through activation.
  process.data.activated = { ...process.data, history: undefined, compiled: undefined, activated: undefined };
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
    authoring.drop('construct', { id });
    authoring.configure(id, {
      typeId: construct.typeId,
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

  const created = await repository.create(process);
  return new ProcessDefinition(created).toJSON();
}

// Deactivation removes one definition from the additive active set: state
// returns to DRAFT (editable, re-activatable) and the runtime contract
// re-derives from the remaining actives.
export async function deactivate(id, auth) {
  const process = await loadAuthorized(id, auth, 'admin');
  if (process.status?.state?.primary !== 'ACTIVE') {
    throw createError({ statusCode: 409, message: 'Only active process definitions can be deactivated' });
  }
  applyProcessState(process, 'DRAFT', auth.userId, 'Process deactivated');
  const updated = await repository.updateById(id, process);
  await ensureInstanceIndexes((await compileRegistryForOrganization(process.lineage.organizationId)).resolveView(process.lineage.organizationId));
  publishOrgContractChanged(String(process.lineage.organizationId), 'process', { definitionId: String(updated._id) });
  return new ProcessDefinition(updated).toJSON();
}

export async function remove(id, auth, { confirmTypeDeath = false } = {}) {
  const process = await loadAuthorized(id, auth, 'admin');
  // Type lifetime (cts SPEC §4): deleting a definition takes its
  // exclusively-owned types with it — declaration AND data — behind the
  // same disclaimer the apply gate uses. Types other stored definitions
  // (any state) still declare survive.
  const deathCandidates = await findTypeDeathCandidates({
    organizationId: process.lineage.organizationId,
    ignoringDefinitionId: id
  });
  if (deathCandidates.length) {
    const typeDeath = await typeDeathManifest(deathCandidates, process.lineage.organizationId);
    if (!confirmTypeDeath) {
      throw createError({
        statusCode: 409,
        message: `Deleting this definition deletes ${typeDeath.length} type(s) no other definition declares, with all their data`,
        data: { typeDeath }
      });
    }
    await killTypesWithData(typeDeath, { organizationId: process.lineage.organizationId, actor: auth.userId });
  }
  await repository.removeById(id);
  if (process.status?.state?.primary === 'ACTIVE') {
    await ensureInstanceIndexes((await compileRegistryForOrganization(process.lineage.organizationId)).resolveView(process.lineage.organizationId));
    publishOrgContractChanged(String(process.lineage.organizationId), 'process', { definitionId: String(id) });
  }
  return { removed: true };
}

export async function archive(id, auth) {
  const process = await loadAuthorized(id, auth, 'admin');
  applyProcessState(process, 'ARCHIVED', auth.userId, 'Process archived');
  const updated = await repository.updateById(id, process);
  return new ProcessDefinition(updated).toJSON();
}

function manualRunEnvironment(definition, auth = {}, domain = null) {
  return {
    executeEffect: (request, run) => executeDurableEffect(request, auth, run, definition.data, domain),
    isAsyncBoundary: (request, result) => request.kind === 'cts.command' && hasAsyncOutputBoundary(result),
    catalogContext: catalogContextFromDefinition(definition.data, domain),
    // The evaluator must see the same projected domain the compile path
    // used: block records bound to org-authored types pass compilation
    // against the projected entity contract, so the runtime block check
    // reading the static base domain would reject them as undeclared.
    domain: domain || getDomain(),
    data: run => processDataEnvironment(auth, run, domain)
  };
}

export async function startRun(id, payload = {}, auth = {}, options = {}) {
  const process = options.definition ?? await loadAuthorized(id, auth, 'read');
  const definition = process.toJSON ? process.toJSON() : { ...process };
  if (Number(definition.data?.dataflowVersion) !== PROCESS_DATAFLOW_VERSION) {
    throw createError({ statusCode: 409, message: `Process must use dataflow version ${PROCESS_DATAFLOW_VERSION} before it can run` });
  }
  // Protocol acceptance at the execution boundary: a v5 definition lowers
  // here once, so the run's stored snapshot and every downstream evaluation
  // see the executable working shapes. The projected domain is computed once
  // and shared by acceptance and the run environment so compilation and
  // evaluation cannot disagree about the entity contracts.
  const projectedDomain = await getProjectedDomain(resolveOrganizationId(auth));
  const runnableDefinition = {
    ...definition,
    data: currentProcessDefinition(definition.data, projectedDomain)
  };
  const organizationId = resolveOrganizationId(auth);
  const actor = buildRunActor(auth, organizationId);
  const runRepository = options.runRepository || getRunRepository(await repository.getConnection());
  const run = await executeManualRun(runnableDefinition, payload, {
    actor,
    repository: runRepository,
    ...manualRunEnvironment(runnableDefinition, auth, projectedDomain)
  });
  assertManualRunHasNoMutationFailures(run);
  return serializeProcessResult(run);
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
      // at run time exactly as the designer does — without it the service
      // resolves empty ports and its parameters never reach the handler.
      domain: domain || getDomain()
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
  const resumedDomain = await getProjectedDomain(actor.organizationId ?? null);

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
        catalogContext: catalogContextFromDefinition(definition.data, resumedDomain),
        domain: resumedDomain,
        data: run => processDataEnvironment(actor, run, resumedDomain)
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
  return serializeProcessResult(await previewProcessDataflow(previewDefinition, { trigger, inputs }, {
    targetNodeId: nodeId,
    previewLimit: 100,
    domain: previewDomain,
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
  const socket = process.data.sockets?.[socketId];
  if (!socket) throw createError({ statusCode: 404, message: 'Socket not found in active process' });
  if (socket.direction === 'inbound') {
    throw createError({ statusCode: 400, message: 'Inbound sockets receive projected entities and cannot project source entities' });
  }

  const registry = getPerigramRegistry();
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

export async function executeActiveProcessAction({ actionId, instanceId, data = {}, parameters = {}, entities = {}, targetOrganizationId = null } = {}, auth = {}) {
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
    targetOrganizationId
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
  const updated = await persistProcessEntityPatch(typeId, targetId, flattenMutationPatch(mutation), executionAuth);
  await publishActionEntityEvent(auth, typeId, updated || { _id: targetId }, 'updated', 'process-relation-update');
  return updated;
}

async function resolveManualRelationMutation(typeId, targetId, mutation = {}, action = {}, auth = {}) {
  const contract = action.relationMutation;
  const key = contract?.key;
  const targetValue = getByPath(mutation, `relations.${key}`);
  const targetRef = normalizeRelationRef(targetValue, contract?.targetTypes);
  await assertRelationTargetAvailable(targetRef, contract, auth);
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

async function executeDataflowActionRun({ process, actionId, instanceId, data, parameters, entities, targetOrganizationId }, auth) {
  const effect = Object.values(process.data.processNodes || {})
    .find(node => node.id === actionId && node.kind?.startsWith('cts.'));
  if (!effect || (effect.trigger?.mode || 'manual') !== 'manual') {
    throw createError({ statusCode: 409, message: `Action ${actionId} has no entry trigger` });
  }
  const graphNode = (process.data.graph?.nodes || [])
    .find(node => String(node.data?.refId || node.id) === String(effect.id));
  if (!graphNode) throw createError({ statusCode: 409, message: `Action ${actionId} has no graph node` });
  let run = await startRun(process.id, {
    trigger: { nodeId: graphNode.id },
    inputs: {
      entity: instanceId || entities?.entity || null,
      entities,
      data,
      parameters,
      targetOrganizationId
    }
  }, auth, { definition: process });
  if (run.status === 'failed') {
    throw createError({ statusCode: 400, message: run.error?.message || `Action ${actionId} failed` });
  }
  const effectStep = [...(run.steps || [])].reverse()
    .find(step => step.kind?.startsWith('cts.'));
  return effectStep?.output ?? run.result;
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

export async function executeProcessQuery(processList, auth) {
  return await processList({}, auth);
}

async function queryProcessGraphEntities(typeId, filters = {}, auth = {}) {
  const service = getAppRegistry().getInstanceService(typeId);
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
  const ownerService = getAppRegistry().getInstanceService(ownerType);
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
  return value.id || value._id || null;
}

async function applyProcessOutputStatuses({ actionId, result = {}, processData = {}, organizationId, auth = {} } = {}) {
  const statusesByTypeId = commandOutputStatusMap(actionId, processData);
  if (!statusesByTypeId.size) return;
  for (const entityRef of result.entities || []) {
    const typeId = normalizeTypeId(entityRef.type || entityRef.typeId || '');
    const stateTargets = statusesByTypeId.get(typeId) || [];
    if (stateTargets.length > 1) {
      throw new Error(`Process command action ${actionId} has ambiguous status outputs for ${typeId}`);
    }
    const stateTarget = stateTargets[0];
    const targetState = stateTarget?.targetState;
    const targetId = entityRef.id || entityRef._id;
    if (!typeId || !targetState || !targetId) continue;
    await stateService.setInitialStateForOrganization(
      typeId,
      targetId,
      targetState,
      organizationId,
      auth.userId,
      {
        source: { kind: 'process-run', actionId },
        ...processStatusMetadata({
          typeId,
          producerOutputId: stateTarget.producerOutputId,
          state: { to: targetState }
        }, `Created by process command action ${actionId}`, processData)
      }
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
    id: instanceId(entity),
    change,
    reason
  });
}

function normalizedEffectEntities(effects) {
  if (!effects) return [];
  if (Array.isArray(effects)) return effects.flatMap(effect => effect?.entities || []);
  return effects.entities || [];
}

function instanceId(entity = {}) {
  return entity?._id || entity?.id || null;
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
    if (targetAction?.actionKind !== 'updateEntity' || !(targetAction.state?.to || targetAction.access?.stateTo)) continue;
    const typeId = normalizeTypeId(
      targetAction.typeId
      || targetAction.inputs?.find(input => input.typeId)?.typeId
      || String(edge.sourceHandle || '').replace(/^output:/, '')
    );
    const targetState = targetAction.state?.to || targetAction.access?.stateTo;
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
  const source = data?.stateMeta || data?.context || {};
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
    ...stateDefinitionForAction(action, processData),
    ...(action.state || {})
  });
}

function stateDefinitionForAction(action = {}, processData = {}) {
  const stateRef = action.stateRef;
  if (stateRef && processData?.stateDefinitions?.[stateRef]) return processData.stateDefinitions[stateRef];
  const target = action.state?.to || action.access?.stateTo;
  if (!target) return {};
  return Object.values(processData?.stateDefinitions || {}).find(definition => (
    definition?.stateId === target || definition?.id === target
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

function applyProcessState(process, primary, userId, note) {
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

function getInstanceServiceForAction(action = {}) {
  const typeId = resolveActionTypeId(action);
  if (!typeId) throw createError({ statusCode: 400, message: `Action ${action.id} has no entity type` });
  const service = getAppRegistry().getInstanceService(typeId);
  if (!service) throw createError({ statusCode: 500, message: `Entity service missing for ${typeId}` });
  return service;
}

function createActionExecutionAuth(auth = {}, action = {}, { relationContracts = null } = {}) {
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
  for (const source of constructionSourceGrants(action, relationContracts)) {
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
  appendExecutionGrant(permissions, resolveInstanceFeature(ownerType), {
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
  // The command's own permission rows ride beside its executionGrants:
  // the action a user authorized owns every gate its command declares.
  return [...(command?.access?.permissions || []), ...(command?.access?.executionGrants || [])]
    .filter(grant => grant?.feature)
    .map(grant => ({ level: grant.level || 'read', actions: grant.actions || { view: true }, feature: grant.feature }));
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

function constructionSourceGrants(action = {}, relationContracts = null) {
  const sources = [];
  if (action.parentTypeId) {
    sources.push({ typeId: action.parentTypeId, level: 'read', actions: { view: true } });
  }
  // Declared relation targets are the action's own validated inputs: the
  // execution auth grants their read, or the write fails against the very
  // target check the action itself runs. At the effect boundary the
  // contracts arrive resolved (the authored record carries no compiled
  // mutation); compiled-action callers keep reading their own.
  for (const contract of [...(relationContracts || []), ...(action.mutation?.relationContracts || [])]) {
    sources.push({ typeId: contract.targetType, level: 'read', actions: { view: true } });
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
    const feature = resolveInstanceFeature(source.typeId);
    const key = `${feature}:${source.level}`;
    if (!feature || seen.has(key)) return [];
    seen.add(key);
    return [{ ...source, feature }];
  });
}

function resolveActionFeature(action = {}) {
  return resolveInstanceFeature(resolveActionTypeId(action));
}

function resolveInstanceFeature(typeId = '') {
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

async function normalizeProcessMutation(typeId, mutation = {}, relationContracts = [], auth = {}) {
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
      await assertRelationTargetAvailable(ref, relation, auth);
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
  const service = getAppRegistry().getInstanceService(relation.targetType);
  const target = await service?.processGetById?.(ref.id, auth);
  if (!target) throw createError({ statusCode: 404, message: `${relation.targetType} relation target not found` });
  const entity = target?.toJSON ? target.toJSON() : target;
  const definition = (getDomain().entities || []).find(item => normalizeTypeId(item.type) === normalizeTypeId(relation.targetType));
  assertEntityAccess({
    entity,
    typeId: relation.targetType,
    feature: resolveInstanceFeature(definition?.type || relation.targetType),
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
    queryEntities: async typeId => {
      const service = getAppRegistry().getInstanceService(typeId);
      if (!service?.processList) throw new Error(`Entity service cannot query ${typeId} from a process`);
      return await executeProcessQuery(service.processList, auth);
    },
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

export async function performDurableEffect({ kind, record, inputs }, auth, processData = {}, domain = getDomain()) {
  // Species records execute their own kinds here: the durable branches are
  // keyed on the species while the record keeps its discriminator and
  // authored state reference intact.
  const operation = operationKindOf(record || {}) || kind;
  if (operation === 'cts.command' || operation === 'cts.service') {
    if (!record.commandId) throw new Error('Command effect requires commandId');
    // The command's declared gates ride the execution auth: the action
    // the user authorized owns every command its graph executes.
    const command = getAppRegistry().getCommandDefinition(record.commandId);
    const commandAuth = command
      ? createActionExecutionAuth(auth, { actionKind: 'runCommand', commandId: record.commandId, access: command.access })
      : auth;
    const commandResult = await executeCommand(record.commandId, commandEffectPayload(record.commandId, inputs), commandAuth);
    // The value boundary (SPEC §8 s species): a cts.service's declared
    // output is the handler's value. The command envelope (recording,
    // events, billing) stays in command_runs — spreading it onto the
    // graph would flatten list results into indexed keys.
    return record.kind === 'cts.service' ? (commandResult?.raw ?? commandResult) : commandResult;
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
    const executionAuth = createActionExecutionAuth(auth, record, { relationContracts });
    // Relation values arrive on two channels — the block socket and the
    // construct-addressable `relations.*` construction inputs — and both
    // normalize through the same declared-edge contract, so the stored
    // shape is the declared cardinality whichever channel carried it.
    blockDraft = await normalizeProcessMutation(typeId, { ...blockDraft, ...constructionDraft }, relationContracts, executionAuth);
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
    const organizationId = resolveOrganizationId(auth);
    const created = await handler(draft, {
      userId: auth.userId,
      organizationId,
      role: auth.role,
      executionAuth,
      applyTypedBlocks: result => applyTypedConstructionBlocks(record, blockDraft, result, service, auth)
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
      const normalizedPatch = await normalizeProcessPatchRelations(typeId, patch, relationContracts, auth);
      const result = await stateService.transitionWithResult({
        typeId,
        targetId: target.id,
        targetState: typeof statusChange.value === 'string' ? statusChange.value : statusChange.value?.id,
        auth,
        context: effectTransitionContext(record, inputs),
        patch: Object.keys(normalizedPatch).length ? normalizedPatch : null
      });
      return result.entity;
    }
    const patch = wirePatchFromChanges(persistedChanges);
    const relationValues = declaredRelationValues(inputs.relations, relationContracts);
    if (Object.keys(relationValues).length) patch.relations = { ...(patch.relations || {}), ...relationValues };
    const normalizedPatch = await normalizeProcessPatchRelations(typeId, patch, relationContracts, auth);
    if (!service.processUpdate) throw new Error(`Entity service cannot update ${typeId}`);
    return await service.processUpdate(target.id, normalizedPatch, auth);
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
      // authored target — name the node and the remedy instead of handing
      // the status runtime an undefined target.
      throw new Error(
        `transition ${record.id || '(unnamed)'} declares no target state — author the target in the process designer and re-activate the process (actions execute the activated definition, not the draft)`
      );
    }
    const result = await stateService.transitionWithResult({
      typeId,
      targetId: target.id,
      targetState,
      auth,
      context: effectTransitionContext(record, inputs),
      patch: Object.keys(patch).length ? patch : null
    });
    return result.entity;
  }
  if (operation === 'cts.transition' && record.archiveIntent) {
    const result = await stateService.transitionWithResult({
      typeId,
      targetId: target.id,
      ...(record.archiveIntent ? { intent: record.archiveIntent } : { targetState: 'ARCHIVED' }),
      auth,
      context: effectTransitionContext(record, inputs)
    });
    return result.entity;
  }
  if (operation === 'cts.remove') {
    if (!service.processDelete) throw new Error(`Entity service cannot delete ${typeId}`);
    const deleted = await service.processDelete(target.id, auth);
    await publishActionEntityEvent(auth, typeId, { _id: target.id }, 'deleted', 'process-delete');
    return deleted;
  }
  throw new Error(`Unsupported process effect ${kind}`);
}

function effectTransitionContext(record = {}, inputs = {}) {
  const note = inputs.note ?? record.note;
  return {
    source: { kind: 'process-run', ...(record.id ? { actionId: record.id } : {}) },
    ...(record.state?.axis ? { region: record.state.axis } : {}),
    ...(record.producerOutputId ? { producerOutputId: record.producerOutputId } : {}),
    ...(note != null && note !== '' ? { metadata: { note: String(note) } } : {})
  };
}

async function applyTypedConstructionBlocks(record = {}, blockDraft = {}, created = null, service = null, auth = {}) {
  if (!created || !Object.keys(blockDraft).length) return created;
  if (!service?.processUpdate) throw new Error(`Entity service cannot apply constructed blocks to ${record.typeId}`);
  const targetId = created._id || created.id;
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

// The effect's construction inputs follow the catalog's single derivation:
// the contract inputs for the record's resolved mode (authored entries
// merging over their contract twins, authored extras kept), the record's
// own list only where the domain declares no contract for the type. The
// persisted record's `construction.inputs` is an authoring-time copy that
// can go stale (authored against a domain that lacked the declared
// types), and the ports plus the compiled prompt contract already speak
// the live domain — the draft mapping must read the same list or a
// prompted value that arrived through a port is dropped.
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
    return { type: supplied.type || supplied.typeId, id: String(supplied.id ?? supplied._id ?? '') };
  }
  return entityInputId(supplied);
}

// Field sockets spell row paths as `fields.<path>` (the catalog's socket
// vocabulary — inputDefaults, compiled mutation.fields, the manifest's
// input policy); the row/schema layer and stored patches speak the bare
// path. One spelling per concern, but both ADDRESS the same field: the
// effect boundary accepts either, so a wired-or-prompted `fields.done`
// writes row `done` (owner defect 2026-10-17: the socket spelling was
// dropped silently and mutate actions became no-ops).
function normalizeFieldSocketInputs(inputs = {}, schemas = []) {
    if (!inputs || typeof inputs !== 'object' || !Array.isArray(schemas)) return inputs;
    let mapped = null;
    for (const schema of schemas) {
        if (!schema?.path || schema.path.startsWith('fields.')) continue;
        const socket = `fields.${schema.path}`;
        if (!Object.hasOwn(inputs, socket) || Object.hasOwn(inputs, schema.path)) continue;
        if (!mapped) mapped = { ...inputs };
        mapped[schema.path] = mapped[socket];
        delete mapped[socket];
    }
    return mapped || inputs;
}

// Effect inputs arrive as data packets (the orchestration's one wire
// shape); a stored patch speaks scalars. Unwrap once, here — a packet
// that reached the patch intact was silently rejected by the instance
// write while the save still bumped updatedAt (owner defect 2026-10-17:
// "it can't even change a single boolean value").
function unwrapEffectInput(value, field = {}) {
    if (!isDataTree(value)) return value;
    return packetValue(value, field.type?.base === 'array' ? 'list' : 'item');
}

// The instance wire speaks NESTED blocks (`fields.done` travels as
// patch.fields.done); a dotted key matches no block branch and the write
// silently empties (owner defect 2026-10-17 — the four-layer boolean
// drop). One conversion home for every patch the process seam builds.
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
  wireDeclaration: ['from', 'to', 'role'],
  drop: ['item'],
  configure: ['id'],
  setInputDefault: ['id', 'input'],
  connect: ['id', 'fromPort', 'to', 'toPort']
};

const DECLARATION_STEP_OPS = new Set(['declareClass', 'declareTypeRef', 'declareField', 'wireDeclaration']);

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
      } else if (op === 'wireDeclaration') {
        authoring.wireDeclaration(String(step.from || ''), String(step.to || ''), String(step.role || ''));
      } else if (op === 'drop') {
        authoring.drop(String(step.item || ''), { id });
      } else if (op === 'configure') {
        authoring.configure(id, step.values && typeof step.values === 'object' ? step.values : {});
      } else if (op === 'setInputDefault') {
        authoring.setInputDefault(id, String(step.input || ''), step.value ?? null);
      } else if (op === 'connect') {
        authoring.connect(id, String(step.fromPort || ''), String(step.to || ''), String(step.toPort || ''));
      } else {
        throw new Error(`Unknown authoring step: ${op || '(none)'}`);
      }
    } catch (error) {
      throw createError({ statusCode: 400, message: `Step ${index + 1} (${op}) failed: ${error?.message || error}` });
    }
    // Declaration steps re-seat the seam onto the draft-overlay domain:
    // the tree's own declarations become ports immediately, so a field
    // declares and wires in ONE session — no intermediate apply (the
    // draft-overlay rule the acceptance adapter already follows; live
    // defect 2026-10-17: an unapplied field's connect was refused with
    // `Unknown port` until activation posted it).
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
  const organizationId = resolveOrganizationId(auth);
  await assertOrgAccess(auth, organizationId, 'write');
  const domain = await getProjectedDomain(organizationId);
  const authoring = createDefinitionAuthoring(domain, null, stored?.data || null);
  // Stored-but-unapplied declarations resolve as ports from the first
  // step: the seam starts on the draft-overlay domain, not the raw
  // projection (an edited-in-a-later-session field wired the same wall
  // otherwise).
  authoring.withDomain(declarationOverlayDomain(stored?.data || {}, domain));
  applyAuthoringSteps(authoring, steps, domain);
  const data = authoring.definition();
  for (const key of ['history', 'activated']) {
    if (stored?.data?.[key] !== undefined) data[key] = stored.data[key];
  }
  return await update(id, { data }, auth);
}

// The compiler consumes the CTS-projected domain: strangler-converted system
// declarations plus the organization's authored types (cts_types). A broken
// stored type fails loudly here rather than silently compiling without it.
async function getProjectedDomain(organizationId = null) {
  const registry = await compileRegistryForOrganization(organizationId);
  return projectDomainFromView(registry, organizationId, await projectedDomainsForOrganization(organizationId), {
    packServices: await projectedServicesForOrganization(organizationId)
  });
}

// The rewrites that PERSIST: producer-identity migration and the retired
// Name-input surgery apply to the authored data itself (pre-protocol
// records only for identities; cts records carry their identities from the
// designer). Protocol acceptance runs on a lowered copy and never mutates
// what is stored.
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
  return rewriteRetiredWirePaths(orientChildrenEdgesChildFirst(migration.data));
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
