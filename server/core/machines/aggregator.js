import { connectDB } from '../../db/mongo.js';
import { toFlexibleId } from '../../utils/objectid.js';
import { getCutkitRegistry } from '~/server/runtime/cutkit-registry.js';
import { getEntityCollection } from '~/server/runtime/entities.js';

/**
 * Centralized Aggregation Engine - v24 Expanded
 */

export const aggregator = {
  async syncParentSummary(entityType, lineage) {
    const config = getAggregationMap()[entityType];
    if (!config) return;

    const parentId = lineage[config.lineageRole]?.entityId;
    if (!parentId) return;

    const db = await connectDB();
    
    const targetCollection = getEntityCollection(entityType);
    const summaryCollection = getEntityCollection(config.targetType);
    if (!targetCollection || !summaryCollection) return;
    const flexParentId = toFlexibleId(parentId);

    // 1. Run Aggregation
    const pipeline = [
      {
        $match: {
          [`lineage.${config.lineageRole}.entityId`]: { $in: [flexParentId, parentId.toString()] },
          ...(config.filter || {})
        }
      },
      {
        $group: {
          _id: null,
          totalCount: { $sum: 1 },
          ...(config.fields.sum ? Object.fromEntries(
            Object.entries(config.fields.sum).map(([src, dest]) => [dest, { $sum: `$specs.${src}` }])
          ) : {})
        }
      }
    ];

    const [results] = await db.collection(targetCollection).aggregate(pipeline).toArray();
    
    // 2. Build Update Object
    const updateFields = {};
    if (config.fields.count) {
      updateFields[`summary.${config.fields.count}`] = results?.totalCount || 0;
    }
    if (config.fields.sum) {
      Object.values(config.fields.sum).forEach(dest => {
        updateFields[`summary.${dest}`] = results?.[dest] || 0;
      });
    }
    if (Object.keys(updateFields).length > 0) {
      await db.collection(summaryCollection).updateOne({ _id: flexParentId }, { $set: updateFields });
    }
  }
};

function getAggregationMap() {
  const summaries = getCutkitRegistry().getDomain('cnc')?.summaries || [];
  return Object.fromEntries(summaries.map(summary => [
    summary.sourceType,
    {
      targetType: summary.targetType,
      lineageRole: summary.lineageRole,
      filter: summary.filter || {},
      fields: {
        count: summary.countField,
        sum: summary.sumFields
      }
    }
  ]));
}
