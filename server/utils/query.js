import { ObjectId } from 'mongodb';

export const TOP_LEVEL_LINEAGE_SENTINEL = '__top_level__';

/**
 * Centralized utility to map API ID filters to structured Lineage filters.
 * Used for aggregating children by their parent's ID in the V24 Lineage model.
 * 
 * @param {Object} query - The raw query object (e.g. from getQuery(event) or function args)
 * @param {Array<string>} lineageFields - Optional list of fields to force-map to lineage (e.g. ['catalogId'])
 * @returns {Object} - A clean filter object with IDs mapped to 'lineage.X.entityId'
 */
export function mapLineageQuery(query = {}, lineageFields = []) {
  const finalFilter = { ...query };
  const excludeKeys = ['limit', 'offset', 'sort', 'skip', 'page', 'pageSize'];

  Object.keys(finalFilter).forEach(key => {
    // Skip pagination/sorting params
    if (excludeKeys.includes(key)) return;

    // Check if it's an ID field
    if (key.endsWith('Id') && finalFilter[key] !== undefined && finalFilter[key] !== null && finalFilter[key] !== '') {
      if (key === '_id') {
        finalFilter[key] = ObjectId.isValid(finalFilter[key]) ? new ObjectId(finalFilter[key]) : finalFilter[key];
      } else if (key.startsWith('lineage.')) {
        if (!key.endsWith('.entityId') && !key.endsWith('.revisionId')) {
          throw new Error(`Legacy lineage query path is not supported: ${key}`);
        }
        finalFilter[key] = normalizeLineageQueryValue(finalFilter[key]);
      } else {
        const role = key.slice(0, -2);
        finalFilter[`lineage.${role}.entityId`] = normalizeLineageQueryValue(finalFilter[key]);
        delete finalFilter[key];
      }
    }
  });

  return finalFilter;
}

function normalizeLineageQueryValue(value) {
  if (value === TOP_LEVEL_LINEAGE_SENTINEL) return { $exists: false };
  if (Array.isArray(value)) return value.map(normalizeLineageQueryValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([operator, operand]) => [operator, normalizeLineageQueryValue(operand)]));
  }
  return String(value);
}
