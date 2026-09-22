import { connectDB } from '../../db/mongo.js';
import { ObjectId } from 'mongodb';
import { createStatus } from '../../core/blocks/index.js';
import { hooks } from './hooks.js';
import { toFlexibleId } from '../../utils/objectid.js';
import { createError } from 'h3';
import {
  applyWorkflowTransitionState,
  createWorkflowState,
  getPrimaryState,
  getRegionState,
  getWorkflowRegion,
  normalizeLifecycle,
  normalizeWorkflow,
  validateTransition
} from '~/packages/workflows/src/index.js';
import { assertTransitionAccess, hasInstanceAccess } from '../access/service.js';
import { getCutkitRegistry } from '~/server/runtime/cutkit-registry.js';
import { getEntityCollection, getInstanceDefinition, normalizeTypeId } from '~/server/runtime/entities.js';
import { CLASS_COLLECTIONS } from '~/packages/cts/src/index.js';
import { processEffects } from '../effects/service.js';
import * as workflowOverridesService from '~/server/features/workflow-overrides/service.js';

/**
 * Unified Status Service - v24 Absolute Final
 * Handles state transitions and audit logging.
 * Architectural Excellence: Strict adherence to defined lifecycles.
 */
export const statusService = {
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

  initialStatus(typeId, actor = 'SYSTEM', metadata = {}) {
    const normalizedTypeId = normalizeTypeId(typeId);
    const machine = workflowOverridesService.resolveDefaultWorkflow(normalizedTypeId);
    if (!machine) {
      throw createError({
        statusCode: 400,
        message: `No state machine defined for entity type: ${normalizedTypeId}`
      });
    }
    const actorId = typeof actor === 'object' ? actor.userId : actor;
    return createStatus(createWorkflowState(machine), actorId || 'SYSTEM', metadata);
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
    if (!region?.states?.[targetState]) {
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
    const actorId = typeof actor === 'object' ? actor.userId : actor;
    const eventId = new ObjectId();
    const statusMetadata = mergeStatusDisplayMetadata(persistableStatusMetadata(metadata), region.states[targetState]);
    const status = createStatus(
      createWorkflowState(normalizedMachine, { active: { [regionId]: targetState }, primary: targetState }),
      actorId || 'SYSTEM',
      statusMetadata,
      eventId,
      normalizeLifecycle()
    );
    const statusData = JSON.parse(JSON.stringify(status));
    const db = await connectDB();
    await db.collection('status_events').insertOne({
      _id: eventId,
      targetId: flexId,
      targetType: normalizedTypeId,
      fromState: null,
      toState: targetState,
      fromStatePrimary: null,
      toStatePrimary: targetState,
      region: regionId,
      status: statusData,
      timestamp: new Date()
    });
    await db.collection(collection).updateOne(
      { _id: flexId },
      instanceDoc
        ? { $set: { 'states.main': targetState, updatedAt: new Date().toISOString() } }
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
    const defaultMachine = workflowOverridesService.resolveDefaultWorkflow(normalizedTypeId);
    let loaded;
    try {
      loaded = await loadEntityForWorkflow(normalizedTypeId, targetId, { requireMachine: false, producerOutputId: authContext?.producerOutputId });
    } catch (error) {
      if (!defaultMachine && Number(error?.statusCode) === 404) {
        return { typeId: normalizedTypeId, targetId, state: null, actions: [] };
      }
      throw error;
    }
    const { entity, machine: loadedMachine } = loaded;
    if (!loadedMachine) {
      return { typeId: normalizedTypeId, targetId, state: entity.status?.state || null, actions: [] };
    }
    const normalizedMachine = normalizeWorkflow(loadedMachine);
    const primaryState = getPrimaryState(entity.status, normalizedMachine.initial);
    const lifecycle = entity.status?.lifecycle || normalizeLifecycle();
    const actions = [];

    for (const [regionId, region] of Object.entries(normalizedMachine.regions || {})) {
      const currentState = getRegionState(entity.status, regionId, region.initial);
      for (const transition of region.transitions || []) {
      if (transition.from !== currentState) continue;

      const validation = validateTransition({
        workflow: normalizedMachine,
        currentState,
        targetState: transition.to,
        region: regionId,
        role: auth.role,
        actorId: auth.userId,
        currentStatus: entity.status,
        lifecycle,
        requireLifecyclePayload: false
      });

      if (!validation.ok) continue;

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
      primaryState
    });

    return { typeId: normalizedTypeId, targetId, state: entity.status?.state || createWorkflowState(normalizedMachine), primaryState, actions };
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
      transitionContext = { ...context, region: resolved.regionId };
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
  const currentState = getRegionState(entity.status, regionId, region?.initial);
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
    lifecycle: entity.status?.lifecycle || normalizeLifecycle(),
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

function appendProcessStatusActions(actions = [], { auth = {}, typeId = '', primaryState = '' } = {}) {
  const existingTargets = new Set(actions.map(action => `${action.from || ''}->${action.to || ''}`));
  for (const action of auth.roleAssignments?.actions || []) {
    // The assignment manifest carries the projected UI-contract kinds
    // (`updateInstance`) beside the legacy exposure fields.
    if ((action.actionKind !== 'updateEntity' && action.actionKind !== 'updateInstance') || !(action.status?.to || action.access?.statusTo)) continue;
    if ((action.mutation?.fields || []).length || (action.inputPolicy?.fields || []).length) continue;
    if (normalizeTypeId(action.typeId || action.typeId) !== typeId) continue;
    const from = action.status?.from || action.access?.statusFrom || '';
    const to = action.status?.to || action.access?.statusTo || '';
    if (!to) continue;
    if (from && from !== primaryState) continue;
    if (to === primaryState) continue;
    const key = `${from || primaryState}->${to}`;
    if (existingTargets.has(key)) continue;
    actions.push({
      region: 'main',
      path: [to],
      from: from || primaryState,
      to,
      intent: null,
      display: 'menu',
      label: action.label || ''
    });
    existingTargets.add(key);
  }
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
    const currentState = getRegionState(entity.status, regionId, workflowRegion?.initial);
    const targetStateDefinition = workflowRegion?.states?.[targetState] || {};
    const transitionMetadata = mergeStatusDisplayMetadata(
      persistableStatusMetadata(transitionContext.metadata),
      targetStateDefinition
    );
    const targetLifecycleSchema = targetStateDefinition.lifecycle;
    let lifecycleForValidation = targetLifecycleSchema
      ? mergeLifecycle(entity.status?.lifecycle, transitionContext.lifecycle)
      : transitionContext.lifecycle;
    const eventId = new ObjectId();
    const evidence = await prepareStatusEvidence({
      db,
      entity,
      typeId: normalizedTypeId,
      auth,
      eventId,
      lifecycle: targetLifecycleSchema ? lifecycleForValidation : normalizeLifecycle(),
      schema: targetLifecycleSchema
    });
    lifecycleForValidation = evidence.lifecycle;
    const lifecycleForStatus = targetLifecycleSchema ? lifecycleForValidation : normalizeLifecycle();
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
      currentStatus: entity.status,
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

    for (const hookConfig of transition?.hooks || []) validateHookParams(hookConfig);
    assertTransitionAccess({ transition, entity, auth });

    const hookContext = {
      targetId: flexId,
      targetType: normalizedTypeId,
      fromState: currentState,
      toState: targetState,
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
      entity.status?.state || createWorkflowState(normalizedMachine),
      normalizedMachine,
      transition || { region: regionId },
      targetState
    );
    const newStatus = createStatus(nextState, actorId, transitionMetadata, eventId, lifecycleForStatus);
    
    // Ensure we store a plain object in DB, not a class instance
    const statusData = JSON.parse(JSON.stringify(newStatus));
    
    const eventRecord = {
      _id: eventId,
      targetId: flexId,
      targetType: normalizedTypeId,
      fromState: currentState,
      toState: targetState,
      fromStatePrimary: getPrimaryState(entity.status, normalizedMachine.initial),
      toStatePrimary: getPrimaryState(nextState, targetState),
      region: regionId,
      status: statusData,
      timestamp: new Date()
    };
    
    const entitySet = instanceDoc
      ? { 'states.main': targetState, updatedAt: new Date().toISOString() }
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
      targetState,
      scopedState: targetState,
      region: regionId,
      transition,
      status: statusData,
      event: { source: { type: normalizedTypeId, id: flexId.toString() } },
      registry: getCutkitRegistry()
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
  const { producerOutputId: _producerOutputId, ...persisted } = metadata && typeof metadata === 'object' ? metadata : {};
  return persisted;
}

function normalizeTransitionContext(input = {}) {
  if (input && typeof input === 'object' && ('metadata' in input || 'lifecycle' in input)) {
    return {
      metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
      lifecycle: normalizeLifecycle(input.lifecycle),
      producerOutputId: input.producerOutputId || null,
      region: input.region || input.machineRegion || input.machine,
      path: Array.isArray(input.path) ? input.path : null
    };
  }

  return {
    metadata: input && typeof input === 'object' ? input : {},
    lifecycle: normalizeLifecycle(),
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
  const normalized = normalizeLifecycle(lifecycle);
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
    const collection = getEntityCollection(targetTypeId);
    if (!collection) continue;
    const lineageKey = definition.lineageKey || `${typeId}Id`;
    const instanceId = entity?._id || entity?.identity?.uid;
    const candidates = [instanceId, instanceId?.toString?.()].filter(Boolean);
    const filter = {
      [`lineage.${lineageKey}`]: candidates.length > 1 ? { $in: candidates } : candidates[0]
    };
    const limit = Math.max(1, Math.min(Number(definition.limit || 50), 100));
    const docs = await db.collection(collection).find(filter).limit(limit).toArray();
    const entityDefinition = getInstanceDefinition(targetTypeId);
    const feature = entityDefinition?.feature || entityDefinition?.collection || targetTypeId;
    const readable = docs.filter(doc => hasInstanceAccess({
      entity: doc,
      feature,
      level: 'read',
      auth,
      typeId: targetTypeId
    }));
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
    status: getPrimaryState(entity.status)
  };
}

function mergeLifecycle(current = {}, next = {}) {
  const currentLifecycle = normalizeLifecycle(current);
  const nextLifecycle = normalizeLifecycle(next);

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

function validateHookParams(hookConfig = {}) {
  const domain = getCutkitRegistry().getDomain('cnc');
  const contract = domain?.hooks?.[hookConfig.handler];
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
  const registry = getCutkitRegistry();
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
  const hookFn = registry.getHookHandler(handler) || hooks[handler];
  if (hookFn) return hookFn;

  const service = registry.getInstanceService(typeId);
  return service?.hooks?.[handler] || null;
}

function isSynchronousHook(hookConfig = {}) {
  const domain = getCutkitRegistry().getDomain('cnc');
  const contract = domain?.hooks?.[hookConfig.handler];
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
  const collection = getEntityCollection(normalizedTypeId);

  const db = await connectDB();
  if (collection) {
    const flexId = toFlexibleId(targetId);
    const entity = await db.collection(collection).findOne({ _id: flexId });

    if (entity) {
      const organizationId = entity.lineage?.organizationId || entity.origin?.organizationId || entity.organizationId;
      const machine = await workflowOverridesService.resolveActiveWorkflow({ typeId: normalizedTypeId, organizationId, producerOutputId });

      if (!machine && requireMachine) {
        throw createError({
          statusCode: 400,
          message: `No state machine defined for entity type: ${normalizedTypeId}`
        });
      }

      return { entity, machine, collection, flexId };
    }
    // Dual-world types (a legacy definition beside CTS instances) miss
    // the static collection when the record was created through the
    // instance boundary — fall through to the instance search below.
  }

  // CTS-native instances live in per-class collections resolved per call
  // (org-authored types never enter the static registry). Search them the
  // same way the instance boundary does; the status engine reads and
  // writes those documents through the §3 shape (states.main), never the
  // legacy status block.
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

  return { entity: instanceStatusView(found.doc), machine, collection: found.collection, flexId: found.doc._id, instanceDoc: found.doc };
}

// The §3 stored shape keeps lifecycle in states.main; project the status
// block the engine reads so transitions, guards, and hooks see the live
// state instead of the initial default.
function instanceStatusView(doc = {}) {
  if (doc && typeof doc === 'object' && !doc.status && doc.states && typeof doc.states.main === 'string') {
    return {
      ...doc,
      status: { state: { primary: doc.states.main, active: { main: doc.states.main } } }
    };
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
