import { stateMachines } from './definitions.js';
import { connectDB } from '../../db/mongo.js';
import { ObjectId } from 'mongodb';
import { createStatus } from '../../utils/blocks.js';
import { hooks } from './hooks.js';

/**
 * Unified Status Service
 * Handles state transitions and audit logging
 */
export const statusService = {
  /**
   * Change status of an entity
   * @param {string} entityType - e.g., 'project', 'queue'
   * @param {ObjectId} targetId - ID of the entity
   * @param {string} targetState - The desired state code
   * @param {string} userId - Current user ID
   * @param {string} userRole - Current user role for validation
   * @param {Object} metadata - Optional notes/attachments
   */
  async transition(entityType, targetId, targetState, userId, userRole, metadata = {}) {
    const db = await connectDB();
    const machine = stateMachines[entityType];
    
    if (!machine) throw new Error(`No state machine defined for ${entityType}`);
    
    const collection = `${entityType}s`; 
    const entity = await db.collection(collection).findOne({ _id: new ObjectId(targetId) });
    
    if (!entity) throw new Error(`${entityType} not found`);
    
    const currentState = entity.status?.state || machine.initial;
    
    // 1. Validate Transition
    const transition = machine.transitions.find(t => t.from === currentState && t.to === targetState);
    const isSelfLoop = currentState === targetState && machine.states[currentState]?.canUpdateMeta;
    
    if (!transition && !isSelfLoop) {
      throw new Error(`Invalid transition from ${currentState} to ${targetState} for ${entityType}`);
    }
    
    // 2. Validate Role (unless SYSTEM action)
    if (transition && !transition.roles.includes(userRole) && userRole !== 'SYSTEM') {
      throw new Error(`Unauthorized: Role ${userRole} cannot perform this transition`);
    }
    
    // 3. Create Event Record
    const eventId = new ObjectId();
    const newStatus = createStatus(targetState, userId, metadata, eventId);
    
    const eventRecord = {
      _id: eventId,
      targetId: new ObjectId(targetId),
      targetType: entityType,
      fromState: currentState,
      toState: targetState,
      status: newStatus,
      timestamp: new Date()
    };
    
    await db.collection('status_events').insertOne(eventRecord);
    
    // 4. Update Entity Snapshot
    await db.collection(collection).updateOne(
      { _id: new ObjectId(targetId) },
      { $set: { status: newStatus } }
    );
    
    // 5. Trigger Hooks
    if (transition?.hooks) {
      for (const hookConfig of transition.hooks) {
        const hookFn = hooks[hookConfig.handler];
        if (hookFn) {
          console.log(`[Status Engine] Executing hook ${hookConfig.handler} for ${entityType} ${targetId}`);
          // Execute hook in background to avoid blocking
          hookFn({ 
            targetId, targetType, toState: targetState, userId, userRole, lineage: entity.lineage 
          }, hookConfig.params || {}).catch(err => {
            console.error(`[Status Engine] Hook ${hookConfig.handler} failed:`, err.message);
          });
        }
      }
    }
    
    return newStatus;
  }
};
