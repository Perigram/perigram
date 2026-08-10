import { getCutkitRegistry } from './cutkit-registry.js';

export function normalizeEntityType(type) {
  const key = String(type || '');
  if (!key) return '';
  return getCutkitRegistry().getEntityDefinition(key)?.type || '';
}

export function getEntityDefinition(type) {
  const normalized = normalizeEntityType(type);
  return getCutkitRegistry().getEntityDefinition(normalized);
}

export function getEntityCollection(type) {
  const definition = getEntityDefinition(type);
  return definition?.collection || null;
}
