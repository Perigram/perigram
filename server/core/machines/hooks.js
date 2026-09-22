import { connectDB } from '../../db/mongo.js';
import { createTransitionAuth, stateService } from './service.js';
import { aggregator } from './aggregator.js';
import { toFlexibleId } from '../../utils/objectid.js';
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
    
    const lineageKey = `lineage.${targetType}Id`;
    const flexId = toFlexibleId(targetId);
    
    const children = await db.collection(collection).find({ [lineageKey]: flexId }).toArray();
    
    for (const child of children) {
      try {
        await stateService.transition(childType, child._id, childState, userId, createTransitionAuth(userId, auth || userRole), {
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
