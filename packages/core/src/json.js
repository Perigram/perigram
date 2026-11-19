export function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isJsonValue(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || seen.has(value)) return false;
  if (!Array.isArray(value) && !isRecord(value)) return false;
  seen.add(value);
  const valid = (Array.isArray(value) ? value : Object.values(value)).every(item => isJsonValue(item, seen));
  seen.delete(value);
  return valid;
}

export function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}
