import { formatQuantity } from '#shared/ui-mapping/index.js';

export function resolveDataPath(obj, path) {
  if (!path) return undefined;
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

// Unit policy for fact rows (Phase 6): declared units render as value
// suffixes. Authored `suffix`/`prefix` strings still pass through for
// display shapes that are not closed-units vocabulary.
const UNIT_SUFFIXES = Object.freeze({
  mm: ' mm',
  m: ' m',
  m2: ' m²',
  percent: '%',
  min: ' min',
  deg: '°'
});

export function formatDataValue(raw, field = {}) {
  if (raw == null || raw === '') return null;

  if (field.display === 'parameterMap') {
    return formatParameterMap(raw);
  }

  if (field.display === 'dimensions') {
    return formatDimensions(raw, field);
  }

  if (isQuantityValue(raw)) {
    return formatQuantity(raw, { locale: field.locale || undefined });
  }

  if (typeof raw === 'boolean') {
    return raw ? field.trueLabel ?? null : field.falseLabel ?? null;
  }

  if (field.base === 'instant') {
    return new Date(raw).toLocaleDateString(field.locale || undefined);
  }

  if (typeof raw === 'number' || typeof raw === 'bigint') {
    return String(raw);
  }

  if (raw instanceof Date) {
    return raw.toLocaleDateString(field.locale || undefined);
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

function formatDimensions(raw, field = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const { width, length } = raw;
  if (width == null || length == null) return null;
  return `${width} × ${length}`;
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
  // A quantity value carries its own unit; the descriptor suffix would
  // repeat it.
  const suffix = isQuantityValue(raw)
    ? ''
    : field.suffix ?? (field.unit ? UNIT_SUFFIXES[field.unit] ?? ` ${field.unit}` : '');
  return `${field.prefix ?? ''}${formatted}${suffix}`;
}

function isQuantityValue(raw) {
  return Boolean(raw) && typeof raw === 'object' && Number.isFinite(raw.value);
}

// The one byte-size label (file chips, payload fact strips, revision
// meta).
export function formatFileSize(bytes = 0) {
  const value = Number(bytes) || 0;
  if (value <= 0) return '';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}


function isScalar(value) {
  return ['string', 'number', 'bigint', 'boolean'].includes(typeof value);
}
