import { connectDB } from '../../db/mongo.js';
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
} from '~/packages/core/src/index.js';
import { assertTransitionAccess, hasInstanceAccess } from '../access/service.js';
import { getAppRegistry } from '~/server/runtime/app-registry.js';
import { normalizeTypeId } from '~/server/runtime/entities.js';
import { CLASS_COLLECTIONS, evaluate as evaluateExpression } from '~/packages/cts/src/index.js';
import { processEffects } from '../effects/service.js';
import * as workflowOverridesService from '~/server/features/workflow-overrides/service.js';


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
    const { collection, flexId, instanceDoc } = await loadEntityForWorkflow(normalizedTypeId, targetId, {
      // The machine is already resolved above; the load only needs the
      // document and its collection. Requiring a machine here would fail
      // CTS-native types, whose workflows resolve exclusively through the
      // producer output passed above.
      requireMachine: false,
      producerOutputId: metadata.producerOutputId
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
    const db = await connectDB();
    await db.collection('status_events').insertOne(buildStatusEventRecord({
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
    }));
    await db.collection(collection).updateOne(
      { _id: flexId },
      instanceDoc
        ? { $set: { ...instanceStateSetFromStatus(statusData), updatedAt: new Date().toISOString() } }
        : { $set: { status: statusData } }
    );
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

async function performTransition(typeId, targetId, targetState, userId, userRole, metadata = {}, options = {}) {
    const normalizedTypeId = normalizeTypeId(typeId);
    const transitionContext = normalizeTransitionContext(metadata);
    const auth = normalizeAuthContext(userId, userRole, transitionContext.metadata);
    const actorId = auth.userId || userId || 'SYSTEM';
    const db = await connectDB();
    const { entity, machine, collection, flexId, instanceDoc } = await loadEntityForWorkflow(normalizedTypeId, targetId, { producerOutputId: transitionContext.producerOutputId });

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
    await writeStatusEventAndEntitySnapshot({
      db,
      collection,
      targetId: flexId,
      eventRecord,
      entitySet,
      preferTransaction: Boolean(options.entityPatch && Object.keys(options.entityPatch).length)
    });

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

async function writeStatusEventAndEntitySnapshot({ db, collection, targetId, eventRecord, entitySet, preferTransaction = false }) {
  if (preferTransaction) {
    if (!db.client?.startSession) {
      throw createError({ statusCode: 500, message: 'MongoDB transactions are required for combined entity updates' });
    }
    const session = db.client.startSession();
    try {
      await session.withTransaction(async () => {
        await db.collection('status_events').insertOne(eventRecord, { session });
        const result = await db.collection(collection).updateOne({ _id: targetId }, { $set: entitySet }, { session });
        if (result.matchedCount !== 1) {
          throw createError({ statusCode: 404, message: 'Status target not found during combined entity update' });
        }
      });
      return;
    } finally {
      await session.endSession();
    }
  }

  await db.collection('status_events').insertOne(eventRecord);
  const result = await db.collection(collection).updateOne(
    { _id: targetId },
    { $set: entitySet }
  );
  if (result.matchedCount !== 1) {
    throw createError({ statusCode: 404, message: 'Status target not found during entity status update' });
  }
}

export function createTransitionAuth(userId, userRoleOrAuth, userPermissions = {}) {
  if (userRoleOrAuth && typeof userRoleOrAuth === 'object') {
    return {
      ...userRoleOrAuth,
      userId: userRoleOrAuth.userId || userId,
      memberships: userRoleOrAuth.memberships || userPermissions?.memberships || [],
      effectivePermissions: userRoleOrAuth.effectivePermissions || userPermissions?.effectivePermissions || null,
      permissions: userRoleOrAuth.permissions || userPermissions?.permissions || {}
    };
  }

  const system = userRoleOrAuth === 'SYSTEM' || userPermissions?.system === true || (!userId && !userRoleOrAuth);
  return {
    userId,
    system,
    role: system ? 'SYSTEM' : userRoleOrAuth || userPermissions?.role || null,
    organizationId: userPermissions?.organizationId,
    memberships: userPermissions?.memberships || [],
    effectivePermissions: userPermissions?.effectivePermissions || null,
    permissions: userPermissions?.permissions || {}
  };
}

function persistableStatusMetadata(metadata = {}) {
  const { producerOutputId: _producerOutputId, source: _source, ...persisted } = metadata && typeof metadata === 'object' ? metadata : {};
  return persisted;
}

function buildStatusEventRecord({ eventId, targetId, targetType, fromState, toState, fromStatePrimary, toStatePrimary, region, statusData, actor, operation, evidence, source = null }) {
  return {
    _id: eventId,
    targetId,
    targetType,
    fromState,
    toState,
    fromStatePrimary,
    toStatePrimary,
    region,
    status: statusData,
    actor,
    operation,
    evidence,
    ...(source ? { source } : {}),
    timestamp: new Date()
  };
}

// Field-level changes ride the same audit trail as transitions (SPEC UI):
// who changed which field, from what value to what. The record carries the
// instance's current state on both ends — a field edit never moves the
// machine — and the operation's `changes` list feeds the history surface.
export async function appendFieldChangeEvent(typeId, targetId, { changes = [], actorId = null, auth = {}, state = null } = {}) {
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
  await db.collection('status_events').insertOne(record);
  return record;
}

// Payload revision writes ride the same audit trail as transitions and
// field edits (SPEC §24): who minted which revision, restoring from
// which prior revision. The record carries the instance's current state
// on both ends — a payload write never moves the machine.
export async function appendPayloadRevisionEvent(typeId, targetId, { reason = null, revision = null, restoredFrom = null, actorId = null, auth = {}, state = null } = {}) {
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
  await db.collection('status_events').insertOne(record);
  return record;
}

export function buildEventActor(auth = {}, actorId) {
  const label = auth?.name || auth?.label || null;
  return {
    id: actorId,
    ...(label ? { label } : {}),
    principalType: resolveEventPrincipalType(actorId, auth)
  };
}

function resolveEventPrincipalType(actorId, auth = {}) {
  if (auth?.system === true || actorId === 'SYSTEM') return 'SYSTEM';
  return /^(service|principal)_/.test(String(actorId)) ? 'service' : 'user';
}

function buildEventEvidence(metadata = {}, lifecycle = {}) {
  const normalized = normalizeStatusLifecycle(lifecycle);
  return {
    description: metadata?.note || metadata?.description || null,
    attachments: normalized.attachments,
    lifecycle: normalized
  };
}

function normalizeTransitionContext(input = {}) {
  const invocation = {
    intent: input?.intent || null,
    source: input?.source ?? null
  };
  if (input && typeof input === 'object' && ('metadata' in input || 'lifecycle' in input)) {
    return {
      metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
      lifecycle: normalizeStatusLifecycle(input.lifecycle),
      ...invocation,
      producerOutputId: input.producerOutputId || null,
      region: input.region || input.machineRegion || input.machine,
      path: Array.isArray(input.path) ? input.path : null
    };
  }

  const { intent: _invokedIntent, source: _declaredSource, ...metadata } = input && typeof input === 'object' ? input : {};
  return {
    metadata,
    lifecycle: normalizeStatusLifecycle(),
    ...invocation,
    producerOutputId: input?.producerOutputId || null,
    region: input?.region || input?.machineRegion || input?.machine,
    path: Array.isArray(input?.path) ? input.path : null
  };
}

function normalizeTransitionScope(context = {}) {
  return {
    region: context?.region || context?.metadata?.region || context?.machineRegion || context?.machine || null,
    path: Array.isArray(context?.path) ? context.path : null
  };
}

const STATE_EVIDENCE_KEYS = new Set(['userId', 'timestamp', 'metadata', 'eventId', 'lifecycle']);

function storedStateAxes(states = {}) {
  return Object.fromEntries(Object.entries(states || {})
    .filter(([axis, value]) => axis && !STATE_EVIDENCE_KEYS.has(axis) && typeof value === 'string' && value));
}

// Instance docs persist one flat state string (SPEC §3/§7); the legacy
// status block belongs to static-registry collections only.
function instanceStateSetFromStatus(status = {}) {
  const primary = status?.state?.primary;
  if (typeof primary !== 'string' || !primary) return {};
  // The flat write carries the deadline clock (SPEC §3/§7): when the
  // current state was entered.
  return { state: primary, stateChangedAt: new Date().toISOString() };
}

function statusPrimaryForRegion(workflow = {}, regionId = '', state = '') {
  return workflow.primaryRegion === regionId ? state : workflow.initial || state;
}

function mergeStatusDisplayMetadata(metadata = {}, stateDefinition = {}) {
  const display = statusDisplayMetadata(stateDefinition);
  if (!display) return metadata || {};
  return {
    ...(metadata || {}),
    display: {
      ...display,
      ...((metadata || {}).display || {})
    }
  };
}

function statusDisplayMetadata(stateDefinition = {}) {
  const display = {
    ...(stateDefinition.label ? { label: stateDefinition.label } : {}),
    ...(stateDefinition.color || stateDefinition.severity ? { color: stateDefinition.color || stateDefinition.severity } : {}),
    ...(stateDefinition.severity || stateDefinition.color ? { severity: stateDefinition.severity || stateDefinition.color } : {}),
    ...(stateDefinition.icon ? { icon: stateDefinition.icon } : {})
  };
  return Object.keys(display).length ? display : null;
}

function normalizeAuthContext(userId, userRole, metadata = {}) {
  if (userRole && typeof userRole === 'object') return createTransitionAuth(userId, userRole, metadata);
  if (metadata.auth && typeof metadata.auth === 'object') return createTransitionAuth(userId, metadata.auth, metadata);
  return createTransitionAuth(userId, userRole, metadata);
}

async function prepareStatusEvidence({ db, entity, typeId, auth, eventId, lifecycle = {}, schema = null }) {
  const normalized = normalizeStatusLifecycle(lifecycle);
  if (!schema) return { lifecycle: normalized, entityAttachmentSet: {} };

  const attachments = normalizeLifecycleAttachmentRefs({
    lifecycleAttachments: normalized.attachments,
    schemaAttachments: schema.attachments || {},
    eventId
  });
  const snapshots = await captureLifecycleSnapshots({
    db,
    entity,
    typeId,
    auth,
    snapshotSchema: schema.snapshots || {}
  });
  const data = {
    ...normalized.data,
    ...(Object.keys(snapshots).length
      ? { snapshots: { ...(normalized.data.snapshots || {}), ...snapshots } }
      : {})
  };

  return {
    lifecycle: {
      ...normalized,
      attachments: attachments.lifecycleAttachments,
      data
    },
    entityAttachmentSet: attachments.entityAttachmentSet
  };
}

function validateStatusMetadataPayload(metadata = {}, lifecycleSchema = null) {
  const description = lifecycleSchema?.description;
  if (!description?.required) return;
  const note = metadata?.note || metadata?.description;
  if (!String(note || '').trim()) {
    throw createError({
      statusCode: 400,
      message: 'Status description is required for this transition'
    });
  }
}

function normalizeLifecycleAttachmentRefs({ lifecycleAttachments = {}, schemaAttachments = {}, eventId }) {
  const entityAttachmentSet = {};
  const nextAttachments = {};

  for (const [slot, value] of Object.entries(lifecycleAttachments || {})) {
    const slotSchema = schemaAttachments[slot] || {};
    if (Array.isArray(value)) {
      nextAttachments[slot] = value.map((item, index) => normalizeLifecycleAttachmentRef({
        slot,
        slotSchema,
        item,
        eventId,
        index,
        entityAttachmentSet
      })).filter(Boolean);
      continue;
    }

    const normalized = normalizeLifecycleAttachmentRef({
      slot,
      slotSchema,
      item: value,
      eventId,
      index: null,
      entityAttachmentSet
    });
    if (normalized) nextAttachments[slot] = normalized;
  }

  return { lifecycleAttachments: nextAttachments, entityAttachmentSet };
}

function normalizeLifecycleAttachmentRef({ slot, slotSchema = {}, item = {}, eventId, index = null, entityAttachmentSet }) {
  if (!item || typeof item !== 'object') return null;
  const fileId = item.fileId || item.id;
  if (!fileId) return item;
  const attachmentKey = item.attachmentKey || ['status', slot, eventId?.toString(), index]
    .filter(value => value !== null && value !== undefined)
    .map(mongoSafeAttachmentKeyPart)
    .join('_');
  const bucketName = item.bucketName || item.bucket || 'uploads';
  const name = item.name || item.filename || '';
  const kind = item.kind || slotSchema.kind || slot;
  entityAttachmentSet[`attachments.${attachmentKey}`] = {
    kind,
    fileId: toFlexibleId(fileId),
    name,
    metadata: {
      ...(item.metadata || {}),
      bucketName,
      statusEventId: eventId?.toString(),
      slot
    },
    timestamp: new Date(),
    bucketName,
    url: item.url || `/api/files/download/${fileId}?bucket=${bucketName}`
  };

  return {
    attachmentKey,
    fileId: fileId?.toString?.() || fileId,
    bucketName,
    kind,
    name,
    url: item.url || `/api/files/download/${fileId}?bucket=${bucketName}`
  };
}

function mongoSafeAttachmentKeyPart(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]+/g, '_');
}

async function captureLifecycleSnapshots({ db, entity, typeId, auth, snapshotSchema = {} }) {
  const snapshots = {};
  for (const [key, definition] of Object.entries(snapshotSchema || {})) {
    if (!definition?.typeId) continue;
    const targetTypeId = normalizeTypeId(definition.typeId);
    const lineageKey = definition.lineageKey || `${typeId}Id`;
    const instanceId = entity?._id || entity?.identity?.uid;
    const candidates = [instanceId, instanceId?.toString?.()].filter(Boolean);
    const filter = {
      type: targetTypeId,
      [`lineage.${lineageKey}`]: candidates.length > 1 ? { $in: candidates } : candidates[0]
    };
    const limit = Math.max(1, Math.min(Number(definition.limit || 50), 100));
    // Snapshot targets are §3 instances: the target type's class
    // collection holds them, discriminated by type id, and the class
    // collection name is the access feature grants compile against.
    const docs = [];
    for (const [collectionName, feature] of Object.values(CLASS_COLLECTIONS).map(name => [name, name])) {
      const found = await db.collection(collectionName).find(filter).limit(limit).toArray();
      for (const doc of found) docs.push({ doc, feature });
    }
    const readable = docs
      .filter(({ doc, feature }) => hasInstanceAccess({
        entity: doc,
        feature,
        level: 'read',
        auth,
        typeId: targetTypeId
      }))
      .map(({ doc }) => doc);
    snapshots[key] = {
      capturedAt: new Date(),
      typeId: targetTypeId,
      lineageKey,
      count: readable.length,
      refs: readable.map(snapshotEntityRef)
    };
  }
  return snapshots;
}

function snapshotEntityRef(entity = {}) {
  return {
    id: entity._id?.toString?.() || entity._id || entity.identity?.uid || '',
    label: entity.identity?.name || entity.identity?.slug || entity.identity?.uid || entity._id?.toString?.() || '',
    status: getPrimaryState(entity.states ?? entity.status ?? entity.state, null)
  };
}

function mergeLifecycle(current = {}, next = {}) {
  const currentLifecycle = normalizeStatusLifecycle(current);
  const nextLifecycle = normalizeStatusLifecycle(next);

  return {
    actors: nextLifecycle.actors.length > 0 ? nextLifecycle.actors : currentLifecycle.actors,
    attachments: {
      ...currentLifecycle.attachments,
      ...nextLifecycle.attachments
    },
    data: {
      ...currentLifecycle.data,
      ...nextLifecycle.data
    }
  };
}

// Hook contracts live in whichever registered domain declares them (a
// pack mounting `hookHandlers` declares them beside its domain); the
// engine owns no handler names.
function findHookContract(handler) {
  for (const domain of getAppRegistry().listDomains()) {
    const contract = domain?.hooks?.[handler];
    if (contract) return contract;
  }
  return null;
}

function validateHookParams(hookConfig = {}) {
  const contract = findHookContract(hookConfig.handler);
  if (!contract) throw createError({ statusCode: 500, message: `Hook contract missing for ${hookConfig.handler}` });

  const params = hookConfig.params || {};
  const fields = contract.parameters || [];
  const names = new Set(fields.map(field => field.name));
  for (const field of fields) {
    if (field.required && (params[field.name] === undefined || params[field.name] === null || params[field.name] === '')) {
      throw createError({ statusCode: 500, message: `Hook ${hookConfig.handler} requires parameter ${field.name}` });
    }
  }
  for (const key of Object.keys(params)) {
    if (!names.has(key)) throw createError({ statusCode: 500, message: `Hook ${hookConfig.handler} has unknown parameter ${key}` });
  }
}

async function assertTransitionPreflight({ transition, entity, targetId, targetType, currentState, auth }) {
  const hasBeforeHooks = (transition?.hooks || []).some(hook => (hook.phase || 'after') === 'before');
  if (!hasBeforeHooks) return;

  const actorId = auth.userId || 'SYSTEM';
  await runTransitionHooks(
    transition,
    'before',
    {
      targetId: toFlexibleId(targetId),
      targetType,
      fromState: currentState,
      toState: transition.to,
      userId: actorId,
      userRole: auth.role,
      auth,
      lineage: entity.lineage,
      entity,
      dryRun: true
    },
    { collectEffects: false, log: false }
  );
}

function isConfigurationError(error) {
  const statusCode = Number(error?.statusCode || error?.status || 0);
  return !statusCode || statusCode >= 500;
}

async function runTransitionHooks(transition, phase, context, options = {}) {
  const effects = [];
  const registry = getAppRegistry();
  const { collectEffects = true, log = true } = options;

  for (const hookConfig of transition?.hooks || []) {
    const hookPhase = hookConfig.phase || 'after';
    if (hookPhase !== phase) continue;

    validateHookParams(hookConfig);
    const hookFn = resolveHookHandler(registry, context.targetType, hookConfig.handler);
    if (!hookFn) {
      console.warn(`[Status Engine] Hook "${hookConfig.handler}" not found in core or ${context.targetType} service.`);
      continue;
    }

    const runHook = async () => {
      if (log) console.log(`[Status Engine] Executing hook ${hookConfig.handler} for ${context.targetType} ${context.targetId}`);
      const result = await hookFn(context, hookConfig.params || {});
      if (collectEffects) appendHookEffects(effects, result);
    };

    if (phase === 'before' || isSynchronousHook(hookConfig)) {
      await runHook();
    } else {
      runHook().catch(err => {
        console.error(`[Status Engine] Hook ${hookConfig.handler} failed:`, err.message);
      });
    }
  }

  return effects;
}

function resolveHookHandler(registry, typeId, handler) {
  const hookFn = registry.getHookHandler(handler);
  if (hookFn) return hookFn;

  const service = registry.getInstanceService(typeId);
  return service?.hooks?.[handler] || null;
}

function isSynchronousHook(hookConfig = {}) {
  const contract = findHookContract(hookConfig.handler);
  return hookConfig.mode === 'sync' || hookConfig.blocking === true || contract?.mode === 'sync';
}

function appendHookEffects(effects, result) {
  if (!result) return;
  if (Array.isArray(result)) {
    effects.push(...result.filter(Boolean));
    return;
  }
  if (Array.isArray(result.effects)) {
    effects.push(...result.effects.filter(Boolean));
  }
  if (Array.isArray(result.entities)) {
    effects.push(...result.entities.filter(Boolean).map(entity => ({ type: 'relatedEntity', entity })));
  }
  if (result.type || result.kind || result.intent || result.targetState) {
    effects.push(result);
  }
}

async function loadEntityForWorkflow(typeId, targetId, options = {}) {
  const { requireMachine = true, producerOutputId = null } = options;
  const normalizedTypeId = normalizeTypeId(typeId);

  const db = await connectDB();

  // CTS-native instances live in per-class collections resolved per call
  // (org-authored types never enter the static registry). Search them the
  // same way the instance boundary does; the status engine reads and writes
  // those documents through the §3 all-axis state map, never the legacy
  // status block.
  const found = await findInstanceDocument(db, targetId, normalizedTypeId);
  if (!found) {
    throw createError({
      statusCode: 404,
      message: `${normalizedTypeId} not found (ID: ${targetId})`
    });
  }

  const organizationId = found.doc.lineage?.organizationId || found.doc.origin?.organizationId || found.doc.organizationId;
  const machine = await workflowOverridesService.resolveActiveWorkflow({ typeId: normalizedTypeId, organizationId, producerOutputId });

  if (!machine && requireMachine) {
    throw createError({
      statusCode: 400,
      message: `No state machine defined for entity type: ${normalizedTypeId}`
    });
  }

  return {
    entity: instanceStateView(found.doc),
    machine,
    collection: found.collection,
    flexId: found.doc._id,
    instanceDoc: isFlatInstanceDoc(found.doc) ? found.doc : null
  };
}

// A §3 stored-shape instance: typed row + flat state, no legacy status
// block. Those documents write their state flat (SPEC §3/§7).
function isFlatInstanceDoc(doc = {}) {
  return Boolean(doc && doc.type && !doc.status && (doc.fields || typeof doc.state === 'string'));
}

// The §3 stored shape keeps one flat state string. Project it into the
// engine's snapshot shape so region reads resolve the primary; persisted
// legacy `states` axes (pre-flat documents) keep their map until the
// stored-shape migration re-homes them.
function instanceStateView(doc = {}) {
  if (doc && typeof doc === 'object' && !doc.status && typeof doc.state === 'string' && doc.state) {
    return { ...doc, states: { main: doc.state } };
  }
  if (doc && typeof doc === 'object' && !doc.status && doc.states) {
    const axes = storedStateAxes(doc.states);
    if (Object.keys(axes).length) {
      return { ...doc, states: axes };
    }
  }
  return doc;
}

async function findInstanceDocument(db, targetId, typeId) {
  const ids = [];
  try {
    ids.push(new ObjectId(String(targetId)));
  } catch {}
  if (!ids.length || String(ids[0]) !== String(targetId)) ids.push(String(targetId));
  for (const collection of Object.values(CLASS_COLLECTIONS)) {
    for (const id of ids) {
      const doc = await db.collection(collection).findOne({ _id: id, type: typeId });
      if (doc) return { doc, collection };
    }
  }
  return null;
}
