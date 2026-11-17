import { connectDB } from '../../db/mongo.js';
import {
  normalizeTransitionContext,
  normalizeTransitionScope,
  normalizeAuthContext,
  prepareStatusEvidence,
  validateStatusMetadataPayload,
  mergeLifecycle
} from './transition-context.js';
import { assertTransitionPreflight, isConfigurationError, runTransitionHooks, validateHookParams } from './transition-hooks.js';
import { loadEntityForWorkflow } from './entity-loader.js';
export { createTransitionAuth } from './transition-context.js';
import * as machineRepository from './repository.js';
import { buildStatusEventRecord, buildEventActor, buildEventEvidence } from './event-records.js';
import { persistableStatusMetadata, storedStateAxes, instanceStateSetFromStatus, statusPrimaryForRegion, mergeStatusDisplayMetadata } from './status-projection.js';
export { buildEventActor } from './event-records.js';
import { ObjectId } from 'mongodb';
import { createStatus } from '../../core/blocks/index.js';
import { toFlexibleId } from '../../utils/objectid.js';
import { createError } from 'h3';
import {
  applyWorkflowTransitionState,
  createWorkflowState,
  getPrimaryState,
  getRegionState,
  getWorkflowRegion,
  normalizeStatusLifecycle,
  normalizeWorkflow,
  resolveWorkflowStatePath,
  validateTransition
} from '#packages/core';
import { assertTransitionAccess } from '../access/service.js';
import { getAppRegistry } from '~/server/runtime/app-registry.js';
import { normalizeTypeId } from '~/server/runtime/entities.js';
import { evaluate as evaluateExpression } from '#packages/cts';
import { processEffects } from '../effects/service.js';
import * as workflowOverridesService from '~/server/features/workflow-overrides/service.js';
import { getOrganizationChangeSequence, runOrganizationChange } from '~/server/features/instances/index.js';


export const stateService = {
  /**
   * Change status of an entity
   * @param {string} typeId - e.g., 'project', 'queue'
   * @param {string|ObjectId} targetId - ID of the entity
   * @param {string} targetState - The desired state code
   * @param {string} userId - Current user ID
   * @param {string} userRole - Current user role for validation
   * @param {Object} metadata - Optional notes/attachments
   */
  async transition(typeId, targetId, targetState, userId, userRole, metadata = {}) {
    const { status } = await performTransition(typeId, targetId, targetState, userId, userRole, metadata);
    return status;
  },

  async initialStatusForOrganization(typeId, organizationId, actor = 'SYSTEM', metadata = {}) {
    const normalizedTypeId = normalizeTypeId(typeId);
    const expectedSequence = await getOrganizationChangeSequence(organizationId);
    const machine = await workflowOverridesService.resolveActiveWorkflow({ typeId: normalizedTypeId, organizationId, producerOutputId: metadata.producerOutputId });
    if (!machine) {
      throw createError({
        statusCode: 400,
        message: `No state machine defined for entity type: ${normalizedTypeId}`
      });
    }
    const actorId = typeof actor === 'object' ? actor.userId : actor;
    return createStatus(createWorkflowState(machine), actorId || 'SYSTEM', persistableStatusMetadata(metadata));
  },

  async setInitialStateForOrganization(typeId, targetId, targetState, organizationId, actor = 'SYSTEM', metadata = {}) {
    const normalizedTypeId = normalizeTypeId(typeId);
    const machine = await workflowOverridesService.resolveActiveWorkflow({ typeId: normalizedTypeId, organizationId, producerOutputId: metadata.producerOutputId });
    if (!machine) {
      throw createError({
        statusCode: 400,
        message: `No state machine defined for entity type: ${normalizedTypeId}`
      });
    }
    const normalizedMachine = normalizeWorkflow(machine);
    const regionId = normalizedMachine.primaryRegion || 'main';
    const region = getWorkflowRegion(normalizedMachine, regionId);
    const enteredTarget = resolveWorkflowStatePath(region, targetState);
    if (!enteredTarget) {
      throw createError({
        statusCode: 400,
        message: `State ${targetState} is not defined for ${normalizedTypeId}`
      });
    }
    const { collection, flexId, organizationFilter, instanceDoc } = await loadEntityForWorkflow(normalizedTypeId, targetId, {
      // The machine is already resolved above; the load only needs the
      // document and its collection. Requiring a machine here would fail
      // CTS-native types, whose workflows resolve exclusively through the
      // producer output passed above.
      requireMachine: false,
      producerOutputId: metadata.producerOutputId,
      expectedOrganizationId: organizationId
    });
    const actorId = (typeof actor === 'object' ? actor.userId : actor) || 'SYSTEM';
    const eventId = new ObjectId();
    const stateMetadata = mergeStatusDisplayMetadata(persistableStatusMetadata(metadata), region.states[enteredTarget]);
    const initialLifecycle = normalizeStatusLifecycle();
    const status = createStatus(
      createWorkflowState(normalizedMachine, { active: { [regionId]: enteredTarget }, primary: statusPrimaryForRegion(normalizedMachine, regionId, enteredTarget) }),
      actorId,
      stateMetadata,
      eventId,
      initialLifecycle
    );
    const statusData = JSON.parse(JSON.stringify(status));
    if (instanceDoc) await validateFlatInstanceCandidate(normalizedTypeId, instanceDoc, enteredTarget);
    const db = await connectDB();
    await runOrganizationChange(organizationId, {
      kind: 'instance-state-initialized',
      typeId: normalizedTypeId,
      instanceId: String(flexId),
      paths: ['state', 'status'],
      actorId
    }, async () => {
      await machineRepository.writeStatusEventAndEntitySnapshot({
        db,
        collection,
        targetId: flexId,
        eventRecord: buildStatusEventRecord({
          eventId,
          targetId: flexId,
          targetType: normalizedTypeId,
          fromState: null,
          toState: enteredTarget,
          fromStatePrimary: null,
          toStatePrimary: statusData.state.primary,
          region: regionId,
          statusData,
          actor: buildEventActor(typeof actor === 'object' ? actor : {}, actorId),
          operation: { kind: 'initialize', region: regionId },
          evidence: buildEventEvidence(stateMetadata, initialLifecycle),
          source: metadata?.source ?? null
        }),
        entitySet: instanceDoc
          ? { ...instanceStateSetFromStatus(statusData), updatedAt: new Date().toISOString() }
          : { status: statusData },
        entityFilter: {
          ...organizationFilter,
          ...(instanceDoc ? {
            updatedAt: instanceDoc.updatedAt === undefined
              ? { $exists: false }
              : instanceDoc.updatedAt
          } : {})
        },
        preferTransaction: Boolean(instanceDoc),
        incrementRevision: Boolean(instanceDoc)
      });
    }, { expectedSequence });
    return statusData;
  },

  async applyIntent(typeId, targetId, intent, authContext = {}, metadata = {}, transitionContext = {}) {
    const resolved = await resolveIntentTransition({
      typeId,
      targetId,
      intent,
      authContext,
      transitionContext
    });

    return await performTransition(
      resolved.typeId,
      targetId,
      resolved.transition.to,
      authContext?.userId,
      authContext,
      {
        metadata,
        intent,
        region: resolved.regionId,
        ...transitionContext
      }
    );
  },

  async assertIntentAvailable(typeId, targetId, intent, authContext = {}, transitionContext = {}) {
    const resolved = await resolveIntentTransition({
      typeId,
      targetId,
      intent,
      authContext,
      transitionContext,
      preflight: true
    });
    return {
      typeId: resolved.typeId,
      targetId,
      intent,
      region: resolved.regionId,
      from: resolved.currentState,
      to: resolved.transition.to
    };
  },

  async getActions(typeId, targetId, authContext) {
    const normalizedTypeId = normalizeTypeId(typeId);
    const auth = normalizeAuthContext(authContext?.userId, authContext, {});
    let loaded;
    try {
      loaded = await loadEntityForWorkflow(normalizedTypeId, targetId, { requireMachine: false, producerOutputId: authContext?.producerOutputId });
    } catch (error) {
      if (Number(error?.statusCode) === 404) {
        return { typeId: normalizedTypeId, targetId, state: null, actions: [] };
      }
      throw error;
    }
    const { entity, machine: loadedMachine, instanceDoc } = loaded;
    const primaryState = entity.states
      ? getPrimaryState(entity.states, loadedMachine ? normalizeWorkflow(loadedMachine).initial : null)
      : getPrimaryState(entity.status, null);
    if (!loadedMachine) {
      // No machine, still process-driven: compiled process actions surface
      // without one (the graph owns the vocabulary, not a registry machine).
      const actions = [];
      appendProcessStatusActions(actions, {
        auth,
        typeId: normalizedTypeId,
        primaryState
      });
      return { typeId: normalizedTypeId, targetId, state: entity.states || entity.state || null, primaryState, actions };
    }
    const normalizedMachine = normalizeWorkflow(loadedMachine);
    const lifecycle = entity.status?.lifecycle || normalizeStatusLifecycle();
    const actions = [];

    for (const [regionId, region] of Object.entries(normalizedMachine.regions || {})) {
      const rawState = getRegionState(entity.states ?? entity.status, regionId, region.initial);
      const currentState = resolveWorkflowStatePath(region, rawState) || rawState;
      for (const transition of region.transitions || []) {
      if (transition.from !== currentState) continue;
      // Process-owned edges (event-wired transitions) belong to the
      // orchestration: the process executes them, availability keeps them.
      if (transition.processOwned === true) continue;

      const validation = validateTransition({
        workflow: normalizedMachine,
        currentState,
        targetState: transition.to,
        region: regionId,
        role: auth.role,
        actorId: auth.userId,
        currentStatus: entity.states ?? entity.status,
        lifecycle,
        requireLifecyclePayload: false
      });

      if (!validation.ok) continue;

      // A guard-failing edge is not actionable (SPEC §7): availability
      // hides it while execution re-evaluates and refuses. An evaluation
      // error is data-dependent, so it hides the action rather than
      // failing the endpoint — execution still surfaces it loudly.
      try {
        if (!transitionGuardAllows(transition, entity, instanceDoc)) continue;
      } catch {
        continue;
      }

      try {
        assertTransitionAccess({ transition, entity, auth });
        await assertTransitionPreflight({
          transition,
          entity,
          targetId,
          targetType: normalizedTypeId,
          currentState,
          auth
        });
      } catch (error) {
        if (isConfigurationError(error)) throw error;
        continue;
      }

      actions.push({
        region: regionId,
        path: region.states?.[transition.to]?.path || [transition.to],
        from: transition.from,
        to: transition.to,
        intent: transition.intent || null,
        display: transition.display,
        displayBtn: transition.displayBtn,
        lifecycle: region.states?.[transition.to]?.lifecycle || null
      });
      }
    }

    appendProcessStatusActions(actions, {
      auth,
      typeId: normalizedTypeId,
      primaryState,
      machine: normalizedMachine,
      entity,
      instanceDoc
    });

    return { typeId: normalizedTypeId, targetId, state: entity.states || createWorkflowState(normalizedMachine), primaryState, actions };
  },

  async transitionWithResult({ typeId, targetId, targetState, intent = null, auth, context = {}, patch = null }) {
    const normalizedTypeId = normalizeTypeId(typeId);
    let transitionTarget = targetState;
    let transitionContext = context;
    if (intent) {
      const resolved = await resolveIntentTransition({
        typeId: normalizedTypeId,
        targetId,
        intent,
        authContext: auth,
        transitionContext: context
      });
      transitionTarget = resolved.transition.to;
      transitionContext = { ...context, intent, region: resolved.regionId };
    }
    const { status, effects } = await performTransition(
      normalizedTypeId,
      targetId,
      transitionTarget,
      auth?.userId,
      auth,
      transitionContext,
      { entityPatch: patch }
    );
    const producerOutputId = transitionContext?.producerOutputId || null;
    const { entity } = await loadEntityForWorkflow(normalizedTypeId, targetId, { producerOutputId });
    const actions = await this.getActions(normalizedTypeId, targetId, {
      ...auth,
      ...(producerOutputId ? { producerOutputId } : {})
    });
    return { entity, status, actions: actions.actions, effects };
  }
};

async function resolveIntentTransition({
  typeId,
  targetId,
  intent,
  authContext = {},
  transitionContext = {},
  preflight = false
}) {
  const normalizedTypeId = normalizeTypeId(typeId);
  const auth = normalizeAuthContext(authContext?.userId, authContext, {});
  const { entity, machine } = await loadEntityForWorkflow(normalizedTypeId, targetId, { producerOutputId: transitionContext.producerOutputId });
  const normalizedMachine = normalizeWorkflow(machine);
  const transitionScope = normalizeTransitionScope(transitionContext);
  const regionId = transitionScope.region || normalizedMachine.primaryRegion || 'main';
  const region = getWorkflowRegion(normalizedMachine, regionId);
  const rawCurrentState = getRegionState(entity.states ?? entity.status, regionId, region?.initial);
  const currentState = resolveWorkflowStatePath(region, rawCurrentState) || rawCurrentState;
  const transition = (region?.transitions || []).find(item => item.intent === intent && item.from === currentState);
  if (!transition) {
    throw createError({
      statusCode: 400,
      message: `No transition intent "${intent}" defined for ${normalizedTypeId} from ${currentState}`
    });
  }

  const validation = validateTransition({
    workflow: normalizedMachine,
    currentState,
    targetState: transition.to,
    region: regionId,
    role: auth.role,
    actorId: auth.userId,
    currentStatus: entity.status,
    lifecycle: entity.status?.lifecycle || normalizeStatusLifecycle(),
    requireLifecyclePayload: false
  });
  if (!validation.ok) {
    throw createError({ statusCode: 400, message: `Transition intent "${intent}" is not available: ${validation.reason}` });
  }
  assertTransitionAccess({ transition, entity, auth });
  if (preflight) {
    await assertTransitionPreflight({
      transition,
      entity,
      targetId,
      targetType: normalizedTypeId,
      currentState,
      auth
    });
  }
  return { typeId: normalizedTypeId, entity, transition, regionId, currentState };
}

function appendProcessStatusActions(actions = [], { auth = {}, typeId = '', primaryState = '', machine = null, entity = null, instanceDoc = null } = {}) {
  const region = machine
    ? (machine.regions?.[machine.primaryRegion] || Object.values(machine.regions || {})[0] || null)
    : null;
  const resolve = value => (region ? (resolveWorkflowStatePath(region, value) || value) : value);
  const declared = new Set((region?.transitions || []).map(transition => (
    `${transition.from}->${resolveWorkflowStatePath(region, transition.to) || transition.to}`
  )));
  const declaredByEdge = new Map((region?.transitions || []).map(transition => [
    `${transition.from}->${resolveWorkflowStatePath(region, transition.to) || transition.to}`,
    transition
  ]));
  const resolvedPrimary = resolve(primaryState);
  const existingTargets = new Set(actions.map(action => `${action.from || ''}->${action.to || ''}`));
  for (const action of auth.roleAssignments?.actions || []) {
    // The assignment manifest carries the projected UI-contract kinds
    // (`updateInstance`) beside the legacy exposure fields.
    if ((action.actionKind !== 'updateEntity' && action.actionKind !== 'updateInstance') || !(action.state?.to || action.access?.stateTo)) continue;
    if ((action.mutation?.fields || []).length || (action.inputPolicy?.fields || []).length) continue;
    if (normalizeTypeId(action.typeId || action.typeId) !== typeId) continue;
    const from = action.state?.from || action.access?.stateFrom || '';
    const to = action.state?.to || action.access?.stateTo || '';
    if (!to) continue;
    const fromState = resolve(from || primaryState);
    const toState = resolve(to);
    if (from && fromState !== resolvedPrimary) continue;
    if (toState === resolvedPrimary) continue;
    // The compiled machine is the authority: a manifest action surfaces
    // only when the machine declares the edge it would execute.
    if (region && !declared.has(`${fromState}->${toState}`)) continue;
    // ... and only while the edge's guard holds for this instance (SPEC §7).
    try {
      if (!transitionGuardAllows(declaredByEdge.get(`${fromState}->${toState}`), entity, instanceDoc)) continue;
    } catch {
      continue;
    }
    const key = `${fromState}->${toState}`;
    if (existingTargets.has(key)) continue;
    actions.push({
      region: machine?.primaryRegion || 'main',
      path: [toState],
      from: fromState,
      to: toState,
      intent: null,
      display: 'menu',
      label: action.label || ''
    });
    existingTargets.add(key);
  }
}

// Transition guards (SPEC §7/§18.3): a guard is a boolean expression AST
// evaluated over { value } — the operated instance's row. A §3 instance
// stores its row flat under `fields`; a legacy status-block doc keeps the
// `data`/`specs` blocks, which merge into the same row shape.
function instanceRowForGuard(entity, instanceDoc) {
  if (instanceDoc?.fields && typeof instanceDoc.fields === 'object') return instanceDoc.fields;
  return { ...(entity.data || {}), ...(entity.specs || {}) };
}

function transitionGuardAllows(transition, entity, instanceDoc) {
  if (!transition?.guard) return true;
  return Boolean(evaluateExpression(transition.guard, { value: instanceRowForGuard(entity, instanceDoc) }));
}

async function validateFlatInstanceCandidate(typeId, instanceDoc, state) {
  const service = getAppRegistry().getInstanceService(typeId);
  if (typeof service?.validateCandidate !== 'function') return false;
  return await service.validateCandidate({ ...instanceDoc, state }, instanceDoc.organizationId ?? null);
}

async function performTransition(typeId, targetId, targetState, userId, userRole, metadata = {}, options = {}) {
    const normalizedTypeId = normalizeTypeId(typeId);
    const transitionContext = normalizeTransitionContext(metadata);
    const auth = normalizeAuthContext(userId, userRole, transitionContext.metadata);
    const actorId = auth.userId || userId || 'SYSTEM';
    const db = await connectDB();
    const { entity, machine, collection, flexId, organizationFilter, instanceDoc } = await loadEntityForWorkflow(normalizedTypeId, targetId, { producerOutputId: transitionContext.producerOutputId });
    const sequenceOrganizationId = instanceDoc?.organizationId ?? auth.organizationId ?? null;
    const expectedSequence = await getOrganizationChangeSequence(sequenceOrganizationId);

    const normalizedMachine = normalizeWorkflow(machine);
    const transitionScope = normalizeTransitionScope(transitionContext);
    const regionId = transitionScope.region || normalizedMachine.primaryRegion || 'main';
    const workflowRegion = getWorkflowRegion(normalizedMachine, regionId);
    const rawCurrentState = getRegionState(entity.states ?? entity.status, regionId, workflowRegion?.initial);
    const currentState = resolveWorkflowStatePath(workflowRegion, rawCurrentState) || rawCurrentState;
    const enteredTarget = resolveWorkflowStatePath(workflowRegion, targetState);
    const targetStateDefinition = enteredTarget ? workflowRegion.states[enteredTarget] : {};
    const transitionMetadata = mergeStatusDisplayMetadata(
      persistableStatusMetadata(transitionContext.metadata),
      targetStateDefinition
    );
    const targetLifecycleSchema = targetStateDefinition.lifecycle;
    // Actors are assignment facts: they merge and persist through
    // schema-less states. Evidence slots are schema facts — without a
    // target schema the payload keeps actors only.
    let lifecycleForValidation = mergeLifecycle(entity.status?.lifecycle, transitionContext.lifecycle);
    if (!targetLifecycleSchema) {
      lifecycleForValidation = { actors: lifecycleForValidation.actors, attachments: {}, data: {} };
    }
    const eventId = new ObjectId();
    const evidence = await prepareStatusEvidence({
      db,
      entity,
      typeId: normalizedTypeId,
      auth,
      eventId,
      lifecycle: lifecycleForValidation,
      schema: targetLifecycleSchema
    });
    lifecycleForValidation = evidence.lifecycle;
    const lifecycleForStatus = lifecycleForValidation;
    validateStatusMetadataPayload(transitionMetadata, targetLifecycleSchema);
    
    // 1. Validate Transition
    const validation = validateTransition({
      workflow: machine,
      currentState,
      targetState,
      region: regionId,
      path: transitionScope.path,
      role: auth.role,
      actorId,
      currentStatus: entity.states ?? entity.status,
      lifecycle: lifecycleForValidation
    });
    const transition = validation.transition;

    if (!validation.ok && validation.reason === 'invalid_transition') {
      throw createError({ 
        statusCode: 400, 
        message: `Invalid transition from ${currentState} to ${targetState} for ${normalizedTypeId}` 
      });
    }
    
    if (!validation.ok && (validation.reason === 'actor_denied' || validation.reason === 'capability_denied')) {
      throw createError({
        statusCode: 403,
        message: `Unauthorized lifecycle actor for transition ${currentState} -> ${targetState} for ${normalizedTypeId}`
      });
    }

    if (!validation.ok) {
      throw createError({
        statusCode: 400,
        message: `Invalid lifecycle payload for ${normalizedTypeId} status ${targetState}: ${validation.reason}`
      });
    }

    // The guard re-evaluates atomically at commit against the loaded
    // instance (SPEC §18.3): a guard that no longer holds refuses the
    // transition — a racing transition loses, never merges.
    if (!transitionGuardAllows(transition, entity, instanceDoc)) {
      throw createError({
        statusCode: 409,
        message: `Guard refused transition ${currentState} -> ${targetState} for ${normalizedTypeId}`
      });
    }

    for (const hookConfig of transition?.hooks || []) validateHookParams(hookConfig);
    assertTransitionAccess({ transition, entity, auth });

    const hookContext = {
      targetId: flexId,
      targetType: normalizedTypeId,
      fromState: currentState,
      toState: validation.to || enteredTarget,
      region: regionId,
      userId: actorId,
      userRole: auth.role,
      auth,
      lineage: entity.lineage,
      entity
    };
    await runTransitionHooks(transition, 'before', hookContext);
    
    // 3. Create Event Record
    const nextState = applyWorkflowTransitionState(
      entity.states || createWorkflowState(normalizedMachine),
      normalizedMachine,
      transition || { region: regionId },
      targetState
    );
    const newStatus = createStatus(nextState, actorId, transitionMetadata, eventId, lifecycleForStatus);
    
    // Ensure we store a plain object in DB, not a class instance
    const statusData = JSON.parse(JSON.stringify(newStatus));
    if (instanceDoc) await validateFlatInstanceCandidate(normalizedTypeId, instanceDoc, validation.to || enteredTarget);

    const operationIntent = transitionContext.intent || transition?.intent || null;
    const eventRecord = buildStatusEventRecord({
      eventId,
      targetId: flexId,
      targetType: normalizedTypeId,
      fromState: currentState,
      toState: validation.to || enteredTarget,
      fromStatePrimary: getPrimaryState(entity.states ?? entity.status, normalizedMachine.initial),
      toStatePrimary: getPrimaryState(nextState, normalizedMachine.initial),
      region: regionId,
      statusData,
      actor: buildEventActor(auth, actorId),
      operation: {
        kind: transitionContext.intent ? 'intent' : 'transition',
        ...(operationIntent ? { intent: operationIntent } : {}),
        region: regionId
      },
      evidence: buildEventEvidence(transitionMetadata, evidence.lifecycle),
      source: transitionContext.source
    });
    
    const entitySet = instanceDoc
      ? {
        ...instanceStateSetFromStatus(statusData),
        ...evidence.entityAttachmentSet,
        ...(options.entityPatch || {}),
        updatedAt: new Date().toISOString()
      }
      : {
        status: statusData,
        ...evidence.entityAttachmentSet,
        ...(options.entityPatch || {})
      };
    await runOrganizationChange(instanceDoc?.organizationId ?? auth.organizationId, {
      kind: 'instance-state-transitioned',
      typeId: normalizedTypeId,
      instanceId: String(flexId),
      paths: ['state', 'status'],
      actorId
    }, () => machineRepository.writeStatusEventAndEntitySnapshot({
      db,
      collection,
      targetId: flexId,
      eventRecord,
      entitySet,
      entityFilter: {
        ...organizationFilter,
        ...(instanceDoc ? {
          updatedAt: instanceDoc.updatedAt === undefined
            ? { $exists: false }
            : instanceDoc.updatedAt
        } : {})
      },
      preferTransaction: Boolean(instanceDoc || (options.entityPatch && Object.keys(options.entityPatch).length)),
      incrementRevision: Boolean(instanceDoc)
    }), { expectedSequence });

    const afterEffects = await runTransitionHooks(
      transition,
      'after',
      { ...hookContext, status: statusData }
    );
    const processedEffects = await processEffects(afterEffects, {
      auth,
      entity,
      typeId: normalizedTypeId,
      targetId: flexId,
      targetState: validation.to || enteredTarget,
      scopedState: validation.to || enteredTarget,
      region: regionId,
      transition,
      status: statusData,
      event: { source: { type: normalizedTypeId, id: flexId.toString() } },
      registry: getAppRegistry()
    });
    return {
      status: newStatus,
      effects: {
        raw: afterEffects,
        ...processedEffects
      }
    };
}


// Field-level changes ride the same audit trail as transitions (SPEC UI):
// who changed which field, from what value to what. The record carries the
// instance's current state on both ends — a field edit never moves the
// machine — and the operation's `changes` list feeds the history surface.
export async function appendFieldChangeEvent(typeId, targetId, { changes = [], actorId = null, auth = {}, state = null, session = null } = {}) {
  const effective = (changes || []).filter(change => change && change.field);
  if (!effective.length) return null;
  const flexId = toFlexibleId(targetId);
  const db = await connectDB();
  const record = buildStatusEventRecord({
    eventId: new ObjectId(),
    targetId: flexId,
    targetType: normalizeTypeId(typeId),
    fromState: state,
    toState: state,
    fromStatePrimary: state,
    toStatePrimary: state,
    region: null,
    statusData: null,
    actor: buildEventActor(auth || {}, actorId),
    operation: { kind: 'field_change', changes: effective },
    evidence: buildEventEvidence({}, {})
  });
  if (session) await machineRepository.insertStatusEvent(db, record, { session });
  else await machineRepository.insertStatusEvent(db, record);
  return record;
}

// Payload revision writes ride the same audit trail as transitions and
// field edits (SPEC §24): who minted which revision, restoring from
// which prior revision. The record carries the instance's current state
// on both ends — a payload write never moves the machine.
export async function appendPayloadRevisionEvent(typeId, targetId, { reason = null, revision = null, restoredFrom = null, actorId = null, auth = {}, state = null, session = null } = {}) {
  if (!reason) return null;
  const flexId = toFlexibleId(targetId);
  const db = await connectDB();
  const record = buildStatusEventRecord({
    eventId: new ObjectId(),
    targetId: flexId,
    targetType: normalizeTypeId(typeId),
    fromState: state,
    toState: state,
    fromStatePrimary: state,
    toStatePrimary: state,
    region: null,
    statusData: null,
    actor: buildEventActor(auth || {}, actorId),
    operation: {
      kind: 'payload_revision',
      reason,
      ...(revision ? { revision } : {}),
      ...(restoredFrom ? { restoredFrom } : {})
    },
    evidence: buildEventEvidence({}, {})
  });
  if (session) await machineRepository.insertStatusEvent(db, record, { session });
  else await machineRepository.insertStatusEvent(db, record);
  return record;
}

