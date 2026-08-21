// Missing-field marker contract.
//
// Path reads in the evaluator produce a marker instead of `undefined` when a
// path segment is absent, so a missing field stays distinguishable from a
// present `null` through the whole data pipeline. The marker is a frozen
// plain object with the reserved `$missingField` key: it survives the
// `structuredClone` calls used by every packet operation (a Symbol or class
// instance would not), and `isMissingField` detects it before and after
// cloning.
//
// The marker never crosses a runtime boundary as-is. `serializeProcessResult`
// is the single conversion point for result emission (preview responses and
// any other runtime result/error payload leaving the process runtime): it
// rewrites every marker to the serializable tag `{ missing: true, path }`
// and leaves present `null` values and all other data untouched, so no
// missing value silently degrades to `null` over JSON.
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
