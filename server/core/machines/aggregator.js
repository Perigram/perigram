import { connectDB } from '../../db/mongo.js';
import { ObjectId } from 'mongodb';
import { toFlexibleId } from '../../utils/objectid.js';
import { pluralize } from '../../utils/strings.js';
import { cncSummaries } from '~/packages/domain-cnc/src/index.js';

/**
 * Centralized Aggregation Engine - v24 Expanded
 */

const AGGREGATION_MAP = Object.fromEntries(cncSummaries.map(summary => [
  summary.entityType,
  {
    parentType: summary.parentType,
    parentIdKey: summary.parentIdKey,
    fields: {
      count: summary.countField,
      sum: summary.sumFields
    }
  }
]));

export const aggregator = {
  async syncParentSummary(entityType, lineage) {
    const config = AGGREGATION_MAP[entityType];
    if (!config) return;

    const parentId = lineage[config.parentIdKey];
    if (!parentId) return;

    const db = await connectDB();
    
    const targetCollection = pluralize(entityType);
    const parentCollection = pluralize(config.parentType);
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
