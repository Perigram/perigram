// Missing-field marker — contract home: README "Missing field vs null".
export const MISSING_FIELD_TAG = '$missingField';

export function missingFieldMarker(path = '') {
  return Object.freeze({ [MISSING_FIELD_TAG]: true, path: String(path || '') });
}

export function isMissingField(value) {
  return Boolean(value && typeof value === 'object' && value[MISSING_FIELD_TAG] === true);
}

export function serializeProcessResult(value) {
  if (isMissingField(value)) return { missing: true, path: value.path };
  if (Array.isArray(value)) return value.map(serializeProcessResult);
  if (value && typeof value === 'object') {
    const result = {};
    for (const [key, item] of Object.entries(value)) result[key] = serializeProcessResult(item);
    return result;
  }
  return value;
}
