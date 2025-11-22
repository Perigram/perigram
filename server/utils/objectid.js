import { ObjectId } from 'mongodb';

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
  if (typeof value === 'string') return ObjectId.isValid(value);
  return false;
}
