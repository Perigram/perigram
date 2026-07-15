import { createError } from 'h3';
import { connectDB } from '../../db/mongo.js';
import { getAppRegistry } from '../../runtime/app-registry.js';
import { toFlexibleId } from '../../utils/objectid.js';
import {
  isEntityReference,
  Lineage,
  normalizeEntityReference,
  normalizeRelations
} from '../blocks/index.js';

const IMMUTABLE_BLOCKS = new Set(['_id', 'origin', 'status']);

export async function mutateEntityFields(entityType, entityId, fields = [], values = {}) {
  const definition = getAppRegistry().getEntityDefinition(entityType);
  if (!definition?.collection) throw createError({ statusCode: 500, message: `Entity collection missing for ${entityType}` });
  const allowedBlocks = new Set(definition.blocks || []);
  const updates = {};
  for (const path of fields) {
    const root = String(path || '').split('.')[0];
    if (!root || IMMUTABLE_BLOCKS.has(root) || !allowedBlocks.has(root)) {
      throw createError({ statusCode: 400, message: `Entity block ${root || path} cannot be mutated` });
    }
    const value = getByPath(values, path);
    if (value !== undefined) updates[path] = normalizeMutationValue(path, value);
  }
  if (!Object.keys(updates).length) return null;
  const db = await connectDB();
  const collection = db.collection(definition.collection);
  const id = toFlexibleId(entityId);
  const result = await collection.findOneAndUpdate({ _id: id }, { $set: updates }, { returnDocument: 'after' });
  if (!result) throw createError({ statusCode: 404, message: `${entityType} not found` });
  return result;
}

function normalizeMutationValue(path, value) {
  try {
    if (path === 'lineage') {
      for (const [role, ref] of Object.entries(value || {})) {
        if (['scope', 'public'].includes(role)) continue;
        if (!isEntityReference(ref)) throw new Error(`lineage.${role} must be a structured entity reference`);
      }
      return new Lineage(value).toJSON();
    }
    if (path.startsWith('lineage.') && path.split('.').length === 2) {
      return normalizeEntityReference(value);
    }
    if (path === 'relations') return normalizeRelations(value);
    if (path.startsWith('relations.') && path.split('.').length === 2) {
      const key = path.slice('relations.'.length);
      const normalized = normalizeRelations({ [key]: value });
      if (!normalized[key] && (Array.isArray(value) ? value.length : value)) {
        throw new Error(`${path} must contain structured entity references`);
      }
      return normalized[key] || [];
    }
    return value;
  } catch (error) {
    throw createError({ statusCode: 400, message: `Invalid mutation value for ${path}: ${error.message}` });
  }
}

function getByPath(source, path) {
  return String(path || '').split('.').filter(Boolean).reduce((value, key) => value?.[key], source);
}
