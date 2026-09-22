import { getCutkitRegistry } from './cutkit-registry.js';

export function normalizeTypeId(type) {
  const key = String(type || '');
  if (!key) return '';
  // Registry definitions canonicalize legacy aliases; unknown ids pass
  // through unchanged — the registry view is the whole catalog and org/
  // pack type ids are valid storage ids themselves (SPEC §19 cut).
  return getCutkitRegistry().getInstanceDefinition(key)?.type || key;
}

export function getInstanceDefinition(type) {
  const normalized = normalizeTypeId(type);
  return getCutkitRegistry().getInstanceDefinition(normalized);
}

export function getEntityCollection(type) {
  const definition = getInstanceDefinition(type);
  return definition?.collection || null;
}
