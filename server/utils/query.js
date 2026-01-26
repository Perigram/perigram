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

    // Check if it's an ID field
    if (key.endsWith('Id') && ObjectId.isValid(finalFilter[key])) {
      const value = new ObjectId(finalFilter[key]);
      
      if (key === '_id') {
        finalFilter[key] = value;
      } else if (key.startsWith('lineage.')) {
        // Already in lineage format, just ensure it's an ObjectId
        finalFilter[key] = value;
      } else {
        // Move legacy/flat ID to lineage path
        finalFilter[`lineage.${key}`] = value;
        delete finalFilter[key];
      }
    }
  });

  return finalFilter;
}