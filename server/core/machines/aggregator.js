import { connectDB } from '../../db/mongo.js';
import { ObjectId } from 'mongodb';
import { toFlexibleId } from '../../utils/objectid.js';
import { pluralize } from '../../utils/strings.js';

/**
 * Centralized Aggregation Engine - v24 Expanded
 */

const AGGREGATION_MAP = {
  queue: {
    parentType: 'project',
    parentIdKey: 'projectId',
    fields: { count: 'queueCount' }
  },
  cassette_instance: {
    parentType: 'project',
    parentIdKey: 'projectId',
    fields: { count: 'instanceCount' }
  },
  nesting_run: {
    parentType: 'queue',
    parentIdKey: 'queueId',
    fields: { count: 'runCount' }
  },
  sheet: {
    parentType: 'queue',
    parentIdKey: 'queueId',
    fields: { count: 'sheetCount', sum: { area: 'totalArea' } }
  },
  color: {
    parentType: 'catalog',
    parentIdKey: 'catalogId',
    fields: { count: 'colorCount' }
  }
};

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

    // Special Case: Sheets update Queue Area
    if (entityType === 'sheet') {
       updateFields['summary.totalArea'] = results?.totalArea || 0;
    }

    if (Object.keys(updateFields).length > 0) {
      await db.collection(parentCollection).updateOne({ _id: flexParentId }, { $set: updateFields });
    }
  }
};
