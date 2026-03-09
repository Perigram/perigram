import { ObjectId } from 'mongodb';

/**
 * Safely convert value to ObjectId if possible, otherwise return as-is (string)
 * Useful for v24 architecture where some IDs are strings and some are ObjectIds
 */
export function toFlexibleId(value) {
  if (!value) return value;
  
  if (value instanceof ObjectId) return value;
  
  if (typeof value === 'string') {
    // Use official isValid instead of regex
    if (ObjectId.isValid(value) && /^[0-9a-fA-F]{24}$/.test(value)) {
      return new ObjectId(value);
    }
    return value;
  }
  
  return value;
}

/**
 * Safely convert value to ObjectId
 * - If already ObjectId, return as-is
 * - If string, convert to ObjectId
 * - Otherwise throw error
 */
export function toObjectId(value) {
  if (!value) {
    throw new Error('Value is required for ObjectId conversion');
  }
  
  if (value instanceof ObjectId) {
    return value;
  }
  
  if (typeof value === 'string') {
    if (!ObjectId.isValid(value)) {
      throw new Error(`Invalid ObjectId string: ${value}`);
    }
    return new ObjectId(value);
  }
  
  throw new Error(`Cannot convert ${typeof value} to ObjectId`);
}

/**
 * Check if value is a valid ObjectId or can be converted to one
 */
export function isValidObjectId(value) {
  if (!value) return false;
  if (value instanceof ObjectId) return true;
  if (typeof value === 'string') return /^[0-9a-fA-F]{24}$/.test(value);
  return false;
}