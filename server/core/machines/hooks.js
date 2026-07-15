import { connectDB } from '../../db/mongo.js';
import { createTransitionAuth, statusService } from './service.js';
import { aggregator } from './aggregator.js';
import { getEntityCollection } from '~/server/runtime/entities.js';

/**
 * Global Status Hook Registry - v24 Standardized
 * Contains only system-wide hooks that apply to multiple entity types.
 * Feature-specific hooks are registered in their respective services.
 * 
 * Architectural Excellence: Decoupled side-effects.
 */
export const hooks = {
  /**
   * Propagate status to all children of an entity
   */
  async propagateToChildren({ targetId, targetType, userId, userRole, auth }, { childType, childState }) {
    const db = await connectDB();
    const collection = getEntityCollection(childType);
    if (!collection) return;
    
    const lineageRole = entityTypeToLineageRole(targetType);
    const children = await db.collection(collection).find({
      [`lineage.${lineageRole}.entityId`]: String(targetId)
    }).toArray();
    
    for (const child of children) {
      try {
        await statusService.transition(childType, child._id, childState, userId, createTransitionAuth(userId, auth || userRole), {
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
    await aggregator.syncParentSummary(targetType, lineage);
  }
};

function entityTypeToLineageRole(entityType = '') {
  return String(entityType).replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
}
