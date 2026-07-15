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
import { assertTransitionAccess, hasEntityAccess } from '../access/service.js';
import { getCutkitRegistry } from '~/server/runtime/cutkit-registry.js';
import { getEntityCollection, getEntityDefinition, normalizeEntityType } from '~/server/runtime/entities.js';
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
   * @param {string} entityType - e.g., 'project', 'queue'
   * @param {string|ObjectId} targetId - ID of the entity
   * @param {string} targetState - The desired state code
   * @param {string} userId - Current user ID
   * @param {string} userRole - Current user role for validation
   * @param {Object} metadata - Optional notes/attachments
   */
  async transition(entityType, targetId, targetState, userId, userRole, metadata = {}) {
    const { status } = await performTransition(entityType, targetId, targetState, userId, userRole, metadata);
    return status;
  },

  initialStatus(entityType, actor = 'SYSTEM', metadata = {}) {
    const normalizedEntityType = normalizeEntityType(entityType);
    const machine = workflowOverridesService.resolveDefaultWorkflow(normalizedEntityType);
    if (!machine) {
      throw createError({
        statusCode: 400,
        message: `No state machine defined for entity type: ${normalizedEntityType}`
      });
    }
    const actorId = typeof actor === 'object' ? actor.userId : actor;
    return createStatus(createWorkflowState(machine), actorId || 'SYSTEM', metadata);
  },

  async initialStatusForOrganization(entityType, organizationId, actor = 'SYSTEM', metadata = {}) {
    const normalizedEntityType = normalizeEntityType(entityType);
    const machine = await workflowOverridesService.resolveActiveWorkflow({ entityType: normalizedEntityType, organizationId });
    if (!machine) {
      throw createError({
        statusCode: 400,
        message: `No state machine defined for entity type: ${normalizedEntityType}`
      });
    }
    const actorId = typeof actor === 'object' ? actor.userId : actor;
    return createStatus(createWorkflowState(machine), actorId || 'SYSTEM', metadata);
  },

  async setInitialStateForOrganization(entityType, targetId, targetState, organizationId, actor = 'SYSTEM', metadata = {}) {
    const normalizedEntityType = normalizeEntityType(entityType);
    const machine = await workflowOverridesService.resolveActiveWorkflow({ entityType: normalizedEntityType, organizationId });
    if (!machine) {
      throw createError({
        statusCode: 400,
        message: `No state machine defined for entity type: ${normalizedEntityType}`
      });
    }
    const normalizedMachine = normalizeWorkflow(machine);
    const regionId = normalizedMachine.primaryRegion || 'main';
    const region = getWorkflowRegion(normalizedMachine, regionId);
    if (!region?.states?.[targetState]) {
      throw createError({
        statusCode: 400,
        message: `State ${targetState} is not defined for ${normalizedEntityType}`
      });
    }
    const { collection, flexId } = await loadEntityForWorkflow(normalizedEntityType, targetId);
    const actorId = typeof actor === 'object' ? actor.userId : actor;
    const eventId = new ObjectId();
    const statusMetadata = mergeStatusDisplayMetadata(metadata, region.states[targetState]);
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
      targetType: normalizedEntityType,
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
      { $set: { status: statusData } }
    );
    return statusData;
  },

  async applyIntent(entityType, targetId, intent, authContext = {}, metadata = {}, transitionContext = {}) {
    const resolved = await resolveIntentTransition({
      entityType,
      targetId,
      intent,
      authContext,
      transitionContext
    });

    return await performTransition(
      resolved.entityType,
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

  async assertIntentAvailable(entityType, targetId, intent, authContext = {}, transitionContext = {}) {
    const resolved = await resolveIntentTransition({
      entityType,
      targetId,
      intent,
      authContext,
      transitionContext,
      preflight: true
    });
    return {
      entityType: resolved.entityType,
      targetId,
      intent,
      region: resolved.regionId,
      from: resolved.currentState,
      to: resolved.transition.to
    };
  },

  async getActions(entityType, targetId, authContext) {
    const normalizedEntityType = normalizeEntityType(entityType);
    const auth = normalizeAuthContext(authContext?.userId, authContext, {});
    const defaultMachine = workflowOverridesService.resolveDefaultWorkflow(normalizedEntityType);
    let loaded;
    try {
      loaded = await loadEntityForWorkflow(normalizedEntityType, targetId, { requireMachine: false });
    } catch (error) {
      if (!defaultMachine && Number(error?.statusCode) === 404) {
        return { entityType: normalizedEntityType, targetId, state: null, actions: [] };
      }
      throw error;
    }
    const { entity, machine: loadedMachine } = loaded;
    if (!loadedMachine) {
      return { entityType: normalizedEntityType, targetId, state: entity.status?.state || null, actions: [] };
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
          targetType: normalizedEntityType,
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
      entityType: normalizedEntityType,
      primaryState
    });

    return { entityType: normalizedEntityType, targetId, state: entity.status?.state || createWorkflowState(normalizedMachine), primaryState, actions };
  },

  async transitionWithResult({ entityType, targetId, targetState, intent = null, auth, context = {}, patch = null }) {
    const normalizedEntityType = normalizeEntityType(entityType);
    let transitionTarget = targetState;
    let transitionContext = context;
    if (intent) {
      const resolved = await resolveIntentTransition({
        entityType: normalizedEntityType,
        targetId,
        intent,
        authContext: auth,
        transitionContext: context
      });
      transitionTarget = resolved.transition.to;
      transitionContext = { ...context, region: resolved.regionId };
    }
    const { status, effects } = await performTransition(
      normalizedEntityType,
      targetId,
      transitionTarget,
      auth?.userId,
      auth,
      transitionContext,
      { entityPatch: patch }
    );
    const { entity } = await loadEntityForWorkflow(normalizedEntityType, targetId);
    const actions = await this.getActions(normalizedEntityType, targetId, auth);
    return { entity, status, actions: actions.actions, effects };
  }
};

async function resolveIntentTransition({
  entityType,
  targetId,
  intent,
  authContext = {},
  transitionContext = {},
  preflight = false
}) {
  const normalizedEntityType = normalizeEntityType(entityType);
  const auth = normalizeAuthContext(authContext?.userId, authContext, {});
  const { entity, machine } = await loadEntityForWorkflow(normalizedEntityType, targetId);
  const normalizedMachine = normalizeWorkflow(machine);
  const transitionScope = normalizeTransitionScope(transitionContext);
  const regionId = transitionScope.region || normalizedMachine.primaryRegion || 'main';
  const region = getWorkflowRegion(normalizedMachine, regionId);
  const currentState = getRegionState(entity.status, regionId, region?.initial);
  const transition = (region?.transitions || []).find(item => item.intent === intent && item.from === currentState);
  if (!transition) {
    throw createError({
      statusCode: 400,
      message: `No transition intent "${intent}" defined for ${normalizedEntityType} from ${currentState}`
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
      targetType: normalizedEntityType,
      currentState,
      auth
    });
  }
  return { entityType: normalizedEntityType, entity, transition, regionId, currentState };
}

function appendProcessStatusActions(actions = [], { auth = {}, entityType = '', primaryState = '' } = {}) {
  const existingTargets = new Set(actions.map(action => `${action.from || ''}->${action.to || ''}`));
  for (const action of auth.roleAssignments?.actions || []) {
    if (action.actionKind !== 'updateEntity' || !(action.status?.to || action.access?.statusTo)) continue;
    if ((action.mutation?.fields || []).length || (action.inputPolicy?.fields || []).length) continue;
    if (normalizeEntityType(action.entityType) !== entityType) continue;
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

async function performTransition(entityType, targetId, targetState, userId, userRole, metadata = {}, options = {}) {
    const normalizedEntityType = normalizeEntityType(entityType);
    const transitionContext = normalizeTransitionContext(metadata);
    const auth = normalizeAuthContext(userId, userRole, transitionContext.metadata);
    const actorId = auth.userId || userId || 'SYSTEM';
    const db = await connectDB();
    const { entity, machine, collection, flexId } = await loadEntityForWorkflow(normalizedEntityType, targetId);

    const normalizedMachine = normalizeWorkflow(machine);
    const transitionScope = normalizeTransitionScope(transitionContext);
    const regionId = transitionScope.region || normalizedMachine.primaryRegion || 'main';
    const workflowRegion = getWorkflowRegion(normalizedMachine, regionId);
    const currentState = getRegionState(entity.status, regionId, workflowRegion?.initial);
    const targetStateDefinition = workflowRegion?.states?.[targetState] || {};
    const transitionMetadata = mergeStatusDisplayMetadata(transitionContext.metadata, targetStateDefinition);
    const targetLifecycleSchema = targetStateDefinition.lifecycle;
    let lifecycleForValidation = targetLifecycleSchema
      ? mergeLifecycle(entity.status?.lifecycle, transitionContext.lifecycle)
      : transitionContext.lifecycle;
    const eventId = new ObjectId();
    const evidence = await prepareStatusEvidence({
      db,
      entity,
      entityType: normalizedEntityType,
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
        message: `Invalid transition from ${currentState} to ${targetState} for ${normalizedEntityType}` 
      });
    }
    
    if (!validation.ok && (validation.reason === 'actor_denied' || validation.reason === 'capability_denied')) {
      throw createError({
        statusCode: 403,
        message: `Unauthorized lifecycle actor for transition ${currentState} -> ${targetState} for ${normalizedEntityType}`
      });
    }

    if (!validation.ok) {
      throw createError({
        statusCode: 400,
        message: `Invalid lifecycle payload for ${normalizedEntityType} status ${targetState}: ${validation.reason}`
      });
    }

    for (const hookConfig of transition?.hooks || []) validateHookParams(hookConfig);
    assertTransitionAccess({ transition, entity, auth });

    const hookContext = {
      targetId: flexId,
      targetType: normalizedEntityType,
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
      targetType: normalizedEntityType,
      fromState: currentState,
      toState: targetState,
      fromStatePrimary: getPrimaryState(entity.status, normalizedMachine.initial),
      toStatePrimary: getPrimaryState(nextState, targetState),
      region: regionId,
      status: statusData,
      timestamp: new Date()
    };
    
    const entitySet = {
      status: statusData,
      ...evidence.entityAttachmentSet,
      ...(options.entityPatch || {})
    };
    if (options.entityPatch && Object.keys(options.entityPatch).length) {
      const session = db.client?.startSession?.();
      if (!session) throw createError({ statusCode: 500, message: 'MongoDB transactions are required for combined entity updates' });
      try {
        await session.withTransaction(async () => {
          await db.collection('status_events').insertOne(eventRecord, { session });
          await db.collection(collection).updateOne({ _id: flexId }, { $set: entitySet }, { session });
        });
      } finally {
        await session.endSession();
      }
    } else {
      await db.collection('status_events').insertOne(eventRecord);
      await db.collection(collection).updateOne(
        { _id: flexId },
        { $set: entitySet }
      );
    }

    const afterEffects = await runTransitionHooks(
      transition,
      'after',
      { ...hookContext, status: statusData }
    );
    const processedEffects = await processEffects(afterEffects, {
      auth,
      entity,
      entityType: normalizedEntityType,
      targetId: flexId,
      targetState,
      scopedState: targetState,
      region: regionId,
      transition,
      status: statusData,
      event: { source: { type: normalizedEntityType, id: flexId.toString() } },
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

function normalizeTransitionContext(input = {}) {
  if (input && typeof input === 'object' && ('metadata' in input || 'lifecycle' in input)) {
    return {
      metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
      lifecycle: normalizeLifecycle(input.lifecycle),
      region: input.region || input.machineRegion || input.machine,
      path: Array.isArray(input.path) ? input.path : null
    };
  }

  return {
    metadata: input && typeof input === 'object' ? input : {},
    lifecycle: normalizeLifecycle(),
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

async function prepareStatusEvidence({ db, entity, entityType, auth, eventId, lifecycle = {}, schema = null }) {
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
    entityType,
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

async function captureLifecycleSnapshots({ db, entity, entityType, auth, snapshotSchema = {} }) {
  const snapshots = {};
  for (const [key, definition] of Object.entries(snapshotSchema || {})) {
    if (!definition?.entityType) continue;
    const targetEntityType = normalizeEntityType(definition.entityType);
    const collection = getEntityCollection(targetEntityType);
    if (!collection) continue;
    const lineageKey = definition.lineageKey || `${entityType}Id`;
    const entityId = entity?._id || entity?.identity?.uid;
    const candidates = [entityId, entityId?.toString?.()].filter(Boolean);
    const filter = {
      [`lineage.${lineageKey}`]: candidates.length > 1 ? { $in: candidates } : candidates[0]
    };
    const limit = Math.max(1, Math.min(Number(definition.limit || 50), 100));
    const docs = await db.collection(collection).find(filter).limit(limit).toArray();
    const entityDefinition = getEntityDefinition(targetEntityType);
    const feature = entityDefinition?.feature || entityDefinition?.collection || targetEntityType;
    const readable = docs.filter(doc => hasEntityAccess({
      entity: doc,
      feature,
      level: 'read',
      auth,
      entityType: targetEntityType
    }));
    snapshots[key] = {
      capturedAt: new Date(),
      entityType: targetEntityType,
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

function resolveHookHandler(registry, entityType, handler) {
  const hookFn = registry.getHookHandler(handler) || hooks[handler];
  if (hookFn) return hookFn;

  const service = registry.getEntityService(entityType);
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

async function loadEntityForWorkflow(entityType, targetId, options = {}) {
  const { requireMachine = true } = options;
  const normalizedEntityType = normalizeEntityType(entityType);
  const collection = getEntityCollection(normalizedEntityType);
  if (!collection) {
    throw createError({
      statusCode: 400,
      message: `No entity collection defined for entity type: ${normalizedEntityType}`
    });
  }

  const db = await connectDB();
  const flexId = toFlexibleId(targetId);
  const entity = await db.collection(collection).findOne({ _id: flexId });

  if (!entity) {
    throw createError({
      statusCode: 404,
      message: `${normalizedEntityType} not found (ID: ${targetId}, Collection: ${collection})`
    });
  }

  const organizationId = entity.lineage?.organizationId || entity.origin?.organizationId || entity.organizationId;
  const machine = await workflowOverridesService.resolveActiveWorkflow({ entityType: normalizedEntityType, organizationId });

  if (!machine && requireMachine) {
    throw createError({
      statusCode: 400,
      message: `No state machine defined for entity type: ${normalizedEntityType}`
    });
  }

  return { entity, machine, collection, flexId };
}
