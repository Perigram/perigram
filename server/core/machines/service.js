import { stateMachines } from './definitions.js';
import { connectDB } from '../../db/mongo.js';
import { ObjectId } from 'mongodb';
import { createStatus, getService } from '../../core/blocks/index.js';
import { hooks } from './hooks.js';
import { toFlexibleId } from '../../utils/objectid.js';
import { createError } from 'h3';
import { pluralize } from '../../utils/strings.js';
import { validateTransition } from '../../../packages/workflows/src/index.js';

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
    const db = await connectDB();
    const machine = stateMachines[entityType];
    
    if (!machine) {
      throw createError({ 
        statusCode: 400, 
        message: `No state machine defined for entity type: ${entityType}` 
      });
    }
    
    const flexId = toFlexibleId(targetId);
    const collection = pluralize(entityType);
    
    const entity = await db.collection(collection).findOne({ _id: flexId });
    
    if (!entity) {
      throw createError({ 
        statusCode: 404, 
        message: `${entityType} not found (ID: ${targetId}, Collection: ${collection})` 
      });
    }
    
    const currentState = entity.status?.state || machine.initial;
    
    // 1. Validate Transition
    const validation = validateTransition({
      workflow: machine,
      currentState,
      targetState,
      role: userRole
    });
    const transition = validation.transition;

    if (!validation.ok && validation.reason === 'invalid_transition') {
      throw createError({ 
        statusCode: 400, 
        message: `Invalid transition from ${currentState} to ${targetState} for ${entityType}` 
      });
    }
    
    // 2. Validate Role (unless SYSTEM action)
    if (!validation.ok && validation.reason === 'role_denied') {
      throw createError({ 
        statusCode: 403, 
        message: `Unauthorized: Role "${userRole}" cannot perform transition ${currentState} -> ${targetState} for ${entityType}. Allowed roles: ${validation.allowedRoles.join(', ')}` 
      });
    }
    
    // 3. Create Event Record
    const eventId = new ObjectId();
    const newStatus = createStatus(targetState, userId, metadata, eventId);
    
    // Ensure we store a plain object in DB, not a class instance
    const statusData = JSON.parse(JSON.stringify(newStatus));
    
    const eventRecord = {
      _id: eventId,
      targetId: flexId,
      targetType: entityType,
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
        // 1. Check built-in global hooks
        let hookFn = hooks[hookConfig.handler];
        
        // 2. Dynamic Fallback: Check the specific Feature Service for this entity
        if (!hookFn) {
          const service = getService(entityType);
          if (service && service.hooks && service.hooks[hookConfig.handler]) {
            hookFn = service.hooks[hookConfig.handler];
          }
        }

        if (hookFn) {
          console.log(`[Status Engine] Executing hook ${hookConfig.handler} for ${entityType} ${targetId}`);
          // Execute hook in background to avoid blocking
          hookFn({ 
            targetId: flexId, targetType: entityType, toState: targetState, userId, userRole, lineage: entity.lineage 
          }, hookConfig.params || {}).catch(err => {
            console.error(`[Status Engine] Hook ${hookConfig.handler} failed:`, err.message);
          });
        } else {
          console.warn(`[Status Engine] Hook "${hookConfig.handler}" not found in core or ${entityType} service.`);
        }
      }
    }
    
    return newStatus;
  }
};
