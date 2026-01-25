import { connectDB } from '../../db/mongo.js';
import { ObjectId } from 'mongodb';
import { statusService } from './service.js';
import { aggregator } from './aggregator.js';

/**
 * Status Hook Registry
 * Implements side-effects triggered by state transitions
 */
export const hooks = {
  /**
   * Propagate status to all children of an entity
   */
  async propagateToChildren({ targetId, targetType, userId, userRole }, { childType, childState }) {
    const db = await connectDB();
    const collection = `${childType}s`;
    const lineageKey = `lineage.${targetType}Id`;
    
    const children = await db.collection(collection).find({ [lineageKey]: new ObjectId(targetId) }).toArray();
    
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
   * Centralized Trigger for Summary Updates
   * This is called whenever an entity changes state.
   */
  async triggerAggregator({ targetType, lineage }) {
    // We pass the task to the aggregator which knows what to do based on entityType
    await aggregator.syncParentSummary(targetType, lineage);
  }
};