import { stateMachines } from './definitions.js';
import { connectDB } from '../../db/mongo.js';
import { ObjectId } from 'mongodb';
import { createStatus } from '../../core/blocks/index.js';
import { hooks } from './hooks.js';
import { toFlexibleId } from '../../utils/objectid.js';
import { createError } from 'h3';
import { normalizeLifecycle, validateTransition } from '~/packages/workflows/src/index.js';
import { assertTransitionAccess } from '../access/service.js';
import { getCutkitRegistry } from '~/server/runtime/cutkit-registry.js';
import { getEntityCollection, normalizeEntityType } from '~/server/runtime/entities.js';
import { processEffects } from '../effects/service.js';

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
    const machine = stateMachines[normalizedEntityType];
    if (!machine) {
      throw createError({
        statusCode: 400,
        message: `No state machine defined for entity type: ${normalizedEntityType}`
      });
    }
    const actorId = typeof actor === 'object' ? actor.userId : actor;
    return createStatus(machine.initial, actorId || 'SYSTEM', metadata);
  },

  async applyIntent(entityType, targetId, intent, authContext = {}, metadata = {}, transitionContext = {}) {
    const normalizedEntityType = normalizeEntityType(entityType);
    const machine = stateMachines[normalizedEntityType];
    if (!machine) {
      throw createError({
        statusCode: 400,
        message: `No state machine defined for entity type: ${normalizedEntityType}`
      });
    }

    const { entity } = await loadEntityForWorkflow(normalizedEntityType, targetId);
    const currentState = entity.status?.state || machine.initial;
    const transition = (machine.transitions || []).find(item => item.intent === intent && item.from === currentState);
    if (!transition) {
      throw createError({
        statusCode: 400,
        message: `No transition intent "${intent}" defined for ${normalizedEntityType} from ${currentState}`
      });
    }

    return await performTransition(
      normalizedEntityType,
      targetId,
      transition.to,
      authContext?.userId,
      authContext,
      {
        metadata,
        ...transitionContext
      }
    );
  },

  async getActions(entityType, targetId, authContext) {
    const normalizedEntityType = normalizeEntityType(entityType);
    const machine = stateMachines[normalizedEntityType];
    if (!machine) {
      return { entityType: normalizedEntityType, targetId, state: null, actions: [] };
    }
    const auth = normalizeAuthContext(authContext?.userId, authContext, {});
    const { entity, machine: loadedMachine } = await loadEntityForWorkflow(normalizedEntityType, targetId);
    const currentState = entity.status?.state || loadedMachine.initial;
    const lifecycle = entity.status?.lifecycle || normalizeLifecycle();
    const actions = [];

    for (const transition of loadedMachine.transitions || []) {
      if (transition.from !== currentState) continue;

      const validation = validateTransition({
        workflow: loadedMachine,
        currentState,
        targetState: transition.to,
        role: auth.role,
        actorId: auth.userId,
        currentStatus: entity.status,
        lifecycle
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
        from: transition.from,
        to: transition.to,
        intent: transition.intent || null,
        display: transition.display,
        displayBtn: transition.displayBtn
      });
    }

    return { entityType: normalizedEntityType, targetId, state: currentState, actions };
  },

  async transitionWithResult({ entityType, targetId, targetState, intent = null, auth, context = {} }) {
    const normalizedEntityType = normalizeEntityType(entityType);
    const { status, effects } = intent
      ? await this.applyIntent(normalizedEntityType, targetId, intent, auth, context?.metadata || context, context)
      : await performTransition(normalizedEntityType, targetId, targetState, auth?.userId, auth, context);
    const { entity } = await loadEntityForWorkflow(normalizedEntityType, targetId);
    const actions = await this.getActions(normalizedEntityType, targetId, auth);
    return { entity, status, actions: actions.actions, effects };
  }
};

async function performTransition(entityType, targetId, targetState, userId, userRole, metadata = {}) {
    const normalizedEntityType = normalizeEntityType(entityType);
    const transitionContext = normalizeTransitionContext(metadata);
    const auth = normalizeAuthContext(userId, userRole, transitionContext.metadata);
    const actorId = auth.userId || userId || 'SYSTEM';
    const db = await connectDB();
    const machine = stateMachines[normalizedEntityType];

    if (!machine) {
      throw createError({
        statusCode: 400,
        message: `No state machine defined for entity type: ${normalizedEntityType}`
      });
    }

    const flexId = toFlexibleId(targetId);
    const collection = getEntityCollection(normalizedEntityType);
    if (!collection) {
      throw createError({
        statusCode: 400,
        message: `No entity collection defined for entity type: ${normalizedEntityType}`
      });
    }

    const entity = await db.collection(collection).findOne({ _id: flexId });

    if (!entity) {
      throw createError({
        statusCode: 404,
        message: `${normalizedEntityType} not found (ID: ${targetId}, Collection: ${collection})`
      });
    }

    const currentState = entity.status?.state || machine.initial;
    const targetLifecycleSchema = machine.states?.[targetState]?.lifecycle;
    const lifecycleForValidation = targetLifecycleSchema
      ? mergeLifecycle(entity.status?.lifecycle, transitionContext.lifecycle)
      : transitionContext.lifecycle;
    const lifecycleForStatus = targetLifecycleSchema ? lifecycleForValidation : normalizeLifecycle();
    
    // 1. Validate Transition
    const validation = validateTransition({
      workflow: machine,
      currentState,
      targetState,
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
      userId: actorId,
      userRole: auth.role,
      auth,
      lineage: entity.lineage,
      entity
    };
    await runTransitionHooks(transition, 'before', hookContext);
    
    // 3. Create Event Record
    const eventId = new ObjectId();
    const newStatus = createStatus(targetState, actorId, transitionContext.metadata, eventId, lifecycleForStatus);
    
    // Ensure we store a plain object in DB, not a class instance
    const statusData = JSON.parse(JSON.stringify(newStatus));
    
    const eventRecord = {
      _id: eventId,
      targetId: flexId,
      targetType: normalizedEntityType,
      fromState: currentState,
      toState: targetState,
      status: statusData,
      timestamp: new Date()
    };
    
    await db.collection('status_events').insertOne(eventRecord);
    
    // 4. Update Entity Snapshot
    await db.collection(collection).updateOne(
      { _id: flexId },
      { $set: { status: statusData } }
    );

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
    permissions: userPermissions?.permissions || {}
  };
}

function normalizeTransitionContext(input = {}) {
  if (input && typeof input === 'object' && ('metadata' in input || 'lifecycle' in input)) {
    return {
      metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
      lifecycle: normalizeLifecycle(input.lifecycle)
    };
  }

  return {
    metadata: input && typeof input === 'object' ? input : {},
    lifecycle: normalizeLifecycle()
  };
}

function normalizeAuthContext(userId, userRole, metadata = {}) {
  if (userRole && typeof userRole === 'object') return createTransitionAuth(userId, userRole, metadata);
  if (metadata.auth && typeof metadata.auth === 'object') return createTransitionAuth(userId, metadata.auth, metadata);
  return createTransitionAuth(userId, userRole, metadata);
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

async function loadEntityForWorkflow(entityType, targetId) {
  const normalizedEntityType = normalizeEntityType(entityType);
  const machine = stateMachines[normalizedEntityType];

  if (!machine) {
    throw createError({
      statusCode: 400,
      message: `No state machine defined for entity type: ${normalizedEntityType}`
    });
  }

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

  return { entity, machine, collection, flexId };
}
