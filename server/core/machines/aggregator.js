import { connectDB } from '../../db/mongo.js';
import { toFlexibleId } from '../../utils/objectid.js';
import { getPerigramRegistry } from '~/server/runtime/perigram-registry.js';
import { getEntityCollection } from '~/server/runtime/entities.js';

/**
 * Centralized Aggregation Engine - v24 Expanded
 */

export const aggregator = {
  async syncParentSummary(typeId, lineage) {
    const config = getAggregationMap()[typeId];
    if (!config) return;

    const parentId = lineage[config.parentIdKey];
    if (!parentId) return;

    const db = await connectDB();
    
    const targetCollection = getEntityCollection(typeId);
    const parentCollection = getEntityCollection(config.parentType);
    if (!targetCollection || !parentCollection) return;
    const flexParentId = toFlexibleId(parentId);

    // 1. Run Aggregation
    const pipeline = [
      { $match: { [`lineage.${config.parentIdKey}`]: flexParentId } },
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
      await db.collection(parentCollection).updateOne({ _id: flexParentId }, { $set: updateFields });
    }
  }
};

function getAggregationMap() {
  const summaries = getPerigramRegistry().getDomain('cnc')?.summaries || [];
  return Object.fromEntries(summaries.map(summary => [
    summary.typeId,
    {
      parentType: summary.parentType,
      parentIdKey: summary.parentIdKey,
      fields: {
        count: summary.countField,
        sum: summary.sumFields
      }
    }
  ]));
}
