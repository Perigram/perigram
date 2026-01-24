import { connectDB } from '../../db/mongo.js';
import { ObjectId } from 'mongodb';
import { statusService } from './service.js';

/**
 * Status Hook Registry
 * Implements side-effects triggered by state transitions
 */
export const hooks = {
  /**
   * Propagate status to all children of an entity
   * @param {Object} params - { targetId, targetType, toState, userId, userRole }
   * @param {Object} hookConfig - { childType, childState }
   */
  async propagateToChildren({ targetId, targetType, userId, userRole }, { childType, childState }) {
    const db = await connectDB();
    const collection = `${childType}s`;
    const lineageKey = `lineage.${targetType}Id`;
    
    const children = await db.collection(collection).find({ [lineageKey]: new ObjectId(targetId) }).toArray();
    
    console.log(`[Status Hook] Propagating ${childState} to ${children.length} ${childType}s`);
    
    for (const child of children) {
      try {
        await statusService.transition(childType, child._id, childState, userId, userRole, {
          reason: `Automatic propagation from parent ${targetType}`
        });
      } catch (err) {
        console.warn(`[Status Hook] Failed to propagate to ${childType} ${child._id}:`, err.message);
      }
    }
  },

  /**
   * Update project summary when children change state
   */
  async updateProjectSummary({ targetId, targetType, lineage }) {
    if (!lineage?.projectId) return;
    
    const db = await connectDB();
    const projectId = new ObjectId(lineage.projectId);
    
    // Aggregate state distribution across all children of this project (for this type)
    // Actually, summary should probably be global across all child types or per type.
    // For now, let's just do a simple count update if needed.
    
    console.log(`[Status Hook] Updating project summary for ${projectId}`);
    
    // Implementation of rich summary aggregation...
  }
};
