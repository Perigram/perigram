export function resolveDataPath(obj, path) {
  if (!path) return undefined;
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

export function formatDataValue(raw, field = {}) {
  if (raw == null || raw === '') return null;

  if (field.display === 'parameterMap') {
    return formatParameterMap(raw);
  }

  if (typeof raw === 'boolean') {
    return raw ? (field.trueLabel || 'Yes') : (field.falseLabel || 'No');
  }

  if (typeof raw === 'number' || typeof raw === 'bigint') {
    return String(raw);
  }

  if (raw instanceof Date) {
    return raw.toLocaleDateString();
  }

  if (Array.isArray(raw)) {
    if (raw.length === 0) return null;
    if (raw.every(isScalar)) return raw.map(String).join(', ');
    return String(raw.length);
  }

  if (typeof raw === 'object') {
    const identifier = ['name', 'label', 'code', 'serial', 'reference', 'uid', 'id']
      .map(key => raw[key])
      .find(isScalar);
    return identifier == null ? null : String(identifier);
  }

  return String(raw);
}

export function formatParameterMap(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const parts = Object.entries(raw)
    .filter(([key, value]) => key && isScalar(value) && value !== '')
    .map(([key, value]) => `${key}=${String(value)}`);
  return parts.length ? parts.join(', ') : null;
}

export function decorateDataValue(raw, field = {}) {
  const formatted = formatDataValue(raw, field);
  if (formatted == null || formatted === '') return null;
  return `${field.prefix ?? ''}${formatted}${field.suffix ?? ''}`;
}

function isScalar(value) {
  return ['string', 'number', 'bigint', 'boolean'].includes(typeof value);
}
