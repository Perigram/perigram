import { ObjectId } from 'mongodb';

/**
 * Standard Blocks Utility
 * Implements v24 Engineering Principles for Lineage and Status
 */

export const createIdentity = (name, slug = '', serial = '', reference = '') => ({
  name,
  slug,
  serial,
  reference
});

export const createStatus = (state, userId, metadata = {}, eventId = null) => ({
  state,
  userId,
  timestamp: new Date(),
  metadata,
  eventId
});

/**
 * Implements the Cumulative Lineage Inheritance Rule
 * child.lineage = { ...parent.lineage, [parentType]Id: parent._id }
 */
export const inheritLineage = (parent, parentType) => {
  if (!parent) return {};
  const parentId = parent._id instanceof ObjectId ? parent._id : new ObjectId(parent._id);
  const parentLineage = parent.lineage || {};
  
  return {
    ...parentLineage,
    [`${parentType}Id`]: parentId
  };
};

export const createSpecs = (data = {}) => ({
  sheetThickness: data.sheetThickness || 0,
  foilThickness: data.foilThickness || 0,
  width: data.width || 0,
  length: data.length || 0,
  area: data.area || 0
});

export const createSummary = (data = {}) => ({
  totalArea: data.totalArea || 0,
  ...data
});
