import { ObjectId } from 'mongodb';

/**
 * Centralized utility to map legacy/flat ID filters to Lineage filters.
 * Used for aggregating children by their parent's ID in the V24 Lineage model.
 * 
 * @param {Object} query - The raw query object (e.g. from getQuery(event) or function args)
 * @param {Array<string>} lineageFields - Optional list of fields to force-map to lineage (e.g. ['catalogId'])
 * @returns {Object} - A clean filter object with IDs mapped to 'lineage.XId'
 */
export function mapLineageQuery(query = {}, lineageFields = []) {
  const finalFilter = { ...query };
  const excludeKeys = ['limit', 'offset', 'sort', 'skip', 'page', 'pageSize'];

  Object.keys(finalFilter).forEach(key => {
    // Skip pagination/sorting params
    if (excludeKeys.includes(key)) return;

    // logic: If it looks like an ID (ends in Id) and is a valid ObjectId, 
    // AND it's not the primary _id, assume it's part of the lineage.
    if (key !== '_id' && key.endsWith('Id') && ObjectId.isValid(finalFilter[key])) {
      
      // Move to lineage path
      finalFilter[`lineage.${key}`] = new ObjectId(finalFilter[key]);
      
      // Remove original key to avoid conflicts or strict schema rejections
      delete finalFilter[key];
    }
  });

  return finalFilter;
}
