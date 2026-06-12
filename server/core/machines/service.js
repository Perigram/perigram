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
    const normalizedEntityType = normalizeEntityType(entityType);
    const transitionContext = normalizeTransitionContext(metadata);
    const auth = normalizeAuthContext(userId, userRole, transitionContext.metadata);
    const actorId = auth.userId || userId || 'SYSTEM';
    const db = await connectDB();
    const registry = getCutkitRegistry();
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
    
    // 5. Trigger Hooks
    if (transition?.hooks) {
      for (const hookConfig of transition.hooks) {
        validateHookParams(hookConfig);
        let hookFn = registry.getHookHandler(hookConfig.handler) || hooks[hookConfig.handler];
        
        // 2. Dynamic Fallback: Check the specific Feature Service for this entity
        if (!hookFn) {
          const service = registry.getEntityService(normalizedEntityType);
          if (service && service.hooks && service.hooks[hookConfig.handler]) {
            hookFn = service.hooks[hookConfig.handler];
          }
        }

        if (hookFn) {
          console.log(`[Status Engine] Executing hook ${hookConfig.handler} for ${normalizedEntityType} ${targetId}`);
          // Execute hook in background to avoid blocking
          hookFn({ 
            targetId: flexId, targetType: normalizedEntityType, toState: targetState, userId: actorId, userRole: auth.role, auth, lineage: entity.lineage 
          }, hookConfig.params || {}).catch(err => {
            console.error(`[Status Engine] Hook ${hookConfig.handler} failed:`, err.message);
          });
        } else {
          console.warn(`[Status Engine] Hook "${hookConfig.handler}" not found in core or ${normalizedEntityType} service.`);
        }
      }
    }
    
    return newStatus;
  },

  async getActions(entityType, targetId, authContext) {
    const normalizedEntityType = normalizeEntityType(entityType);
    const auth = normalizeAuthContext(authContext?.userId, authContext, {});
    if (!stateMachines[normalizedEntityType]) {
      return { entityType: normalizedEntityType, targetId, state: null, actions: [] };
    }
    const { entity, machine } = await loadEntityForWorkflow(normalizedEntityType, targetId);
    const currentState = entity.status?.state || machine.initial;
    const lifecycle = entity.status?.lifecycle || normalizeLifecycle();
    const actions = [];

    for (const transition of machine.transitions || []) {
      if (transition.from !== currentState) continue;

      const validation = validateTransition({
        workflow: machine,
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
      } catch {
        continue;
      }

      actions.push({
        from: transition.from,
        to: transition.to,
        display: transition.display,
        displayBtn: transition.displayBtn
      });
    }

    return { entityType: normalizedEntityType, targetId, state: currentState, actions };
  },

  async transitionWithResult({ entityType, targetId, targetState, auth, context = {} }) {
    const normalizedEntityType = normalizeEntityType(entityType);
    const status = await this.transition(normalizedEntityType, targetId, targetState, auth?.userId, auth, context);
    const { entity } = await loadEntityForWorkflow(normalizedEntityType, targetId);
    const actions = await this.getActions(normalizedEntityType, targetId, auth);
    return { entity, status, actions: actions.actions };
  }
};

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
