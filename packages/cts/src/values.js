// Value universe V (SPEC §2): closed, JSON-encodable, entity graphs only via Ref.
// Descriptors are plain JSON; this module checks descriptors and values.

const BASES = Object.freeze([
  'string', 'number', 'boolean', 'instant', 'id', 'json', 'blob',
  'ref', 'quantity', 'record', 'list', 'map', 'variant', 'enum'
]);

// Authorable row-field bases (SPEC §4 FieldType): every V base except `id` —
// an Id without a carrier Ref is a static error (R2), so it is never offered
// as a field declaration. This is the single source every field editor and
// canvas consumes; no page keeps its own base list.
export const FIELD_BASES = Object.freeze(BASES.filter(base => base !== 'id'));

// A ref field is relation authoring in either cardinality: `ref` is one,
// list-of-ref is many. Both store under `relations.<key>` (SPEC §3/§6).
export function isRefDescriptor(descriptor = {}) {
  return descriptor?.base === 'ref'
    || (descriptor?.base === 'list' && descriptor?.itemType?.base === 'ref');
}

export function refAcceptsOf(descriptor = {}) {
  const target = descriptor?.base === 'ref' ? descriptor : descriptor?.itemType;
  return Array.isArray(target?.accepts) ? target.accepts : [];
}

export function describeType(descriptor = {}) {
  const base = descriptor.base;
  if (!BASES.includes(base)) throw new Error(`Unknown base type ${JSON.stringify(base)}`);
  const normalized = { ...descriptor };
  // Naming facet (SPEC §4): label / display kind / control pin ride
  // verbatim (display kinds are pass-through, not a validated enum);
  // identifier / depiction are closed boolean flags, absent unless true.
  // The legacy nested `render.control` adopts to `control` here — the
  // one-time boundary migration — and the dead `render` key is deleted.
  if (normalized.render?.control && normalized.control == null) {
    normalized.control = normalized.render.control;
  }
  delete normalized.render;
  if (normalized.identifier !== true) delete normalized.identifier;
  if (normalized.depiction !== true) delete normalized.depiction;
  // The retired wire slot key (`data`/`specs`) dies at this boundary —
  // rows live in the one flat `fields` home on the wire.
  delete normalized.slot;
  if (base === 'ref') {
    if (!Array.isArray(descriptor.accepts) || !descriptor.accepts.length) {
      throw new Error('ref requires a non-empty accepts list of type ids');
    }
    normalized.accepts = Object.freeze([...descriptor.accepts]);
  }
  if (base === 'quantity' && !descriptor.unit) throw new Error('quantity requires a unit');
  if ((base === 'list' || base === 'map') && !descriptor.itemType) {
    throw new Error(`${base} requires itemType`);
  }
  if (base === 'variant') {
    if (!Array.isArray(descriptor.tags) || !descriptor.tags.length) {
      throw new Error('variant requires tags');
    }
    if (new Set(descriptor.tags).size !== descriptor.tags.length) {
      throw new Error('variant tags must be unique');
    }
  }
  if (base === 'enum') {
    if (!Array.isArray(descriptor.values) || !descriptor.values.length) {
      throw new Error('enum requires values');
    }
    if (new Set(descriptor.values).size !== descriptor.values.length) {
      throw new Error('enum values must be unique');
    }
  }
  if (descriptor.nullable === true) normalized.nullable = true;
  return Object.freeze(normalized);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function checkValue(descriptor, value) {
  if (value === null || value === undefined) {
    return descriptor.nullable === true ? [] : [`expected ${describeLabel(descriptor)}, got null`];
  }
  switch (descriptor.base) {
    case 'string':
    case 'id':
      return typeof value === 'string' ? [] : [`expected ${descriptor.base}, got ${typeof value}`];
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? [] : ['expected finite number'];
    case 'boolean':
      return typeof value === 'boolean' ? [] : ['expected boolean'];
    case 'instant':
      return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? [] : ['expected ISO instant string'];
    case 'json':
    case 'blob':
      return isPlainObject(value) || typeof value === 'string' || Array.isArray(value) ? [] : ['expected json/blob payload'];
    case 'quantity': {
      if (!isPlainObject(value) || typeof value.value !== 'number') return ['expected { value, unit } quantity'];
      if (value.unit !== descriptor.unit) return [`expected unit ${descriptor.unit}, got ${value.unit}`];
      // Minor-unit money (SPEC §2): currency values are integer minor
      // units — floats are the classic billing defect, refused at the row.
      if (descriptor.unit === 'currency' && !Number.isInteger(value.value)) {
        return ['currency quantities are integer minor units (e.g. cents)'];
      }
      return [];
    }
    case 'ref': {
      if (!isPlainObject(value) || typeof value.type !== 'string' || typeof value.id !== 'string') {
        return ['expected { type, id } ref'];
      }
      // Revision pinning (SPEC §24, owner direction 2026-10-27): a ref may
      // carry the revision it is pinned to; an absent pin follows latest.
      if (value.revision != null && (typeof value.revision !== 'string' || !value.revision)) {
        return ['ref revision pin must be a non-empty revision id'];
      }
      return descriptor.accepts.includes(value.type) ? [] : [`ref target ${value.type} not in accepts [${descriptor.accepts.join(', ')}]`];
    }
    case 'record': {
      if (!isPlainObject(value)) return ['expected record'];
      const fields = descriptor.fields || {};
      const errors = [];
      for (const [name, fieldDescriptor] of Object.entries(fields)) {
        errors.push(...checkValue(fieldDescriptor, value[name]).map(e => `${name}: ${e}`));
      }
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(fields, key)) errors.push(`closed row: unknown field ${key}`);
      }
      return errors;
    }
    case 'list': {
      if (!Array.isArray(value)) return ['expected list'];
      return value.flatMap((item, index) => checkValue(descriptor.itemType, item).map(e => `[${index}]: ${e}`));
    }
    case 'map': {
      if (!isPlainObject(value)) return ['expected map'];
      return Object.entries(value).flatMap(([key, item]) => checkValue(descriptor.itemType, item).map(e => `${key}: ${e}`));
    }
    case 'variant': {
      if (!isPlainObject(value) || typeof value.tag !== 'string') return ['expected { tag, value } variant'];
      if (!descriptor.tags.includes(value.tag)) return [`unknown tag ${value.tag}`];
      const payload = descriptor.payloads?.[value.tag];
      return payload ? checkValue(payload, value.value) : [];
    }
    case 'enum':
      return descriptor.values.includes(value) ? [] : [`expected one of [${descriptor.values.join(', ')}], got ${JSON.stringify(value)}`];
    default:
      return [`uncheckable base ${descriptor.base}`];
  }
}

function describeLabel(descriptor = {}) {
  switch (descriptor.base) {
    case 'ref': return `Ref(${descriptor.accepts?.join(' | ')})`;
    case 'quantity': return `Quantity(${descriptor.unit})`;
    case 'list': return `List(${describeLabel(descriptor.itemType)})`;
    case 'map': return `Map(${describeLabel(descriptor.itemType)})`;
    case 'enum': return descriptor.values?.join(' | ');
    default: return descriptor.base;
  }
}

// R5 support: services consume V without entity pointers.
export function containsRef(descriptor = {}) {
  if (descriptor.base === 'ref') return true;
  if (descriptor.base === 'list' || descriptor.base === 'map') return containsRef(descriptor.itemType);
  if (descriptor.base === 'record') return Object.values(descriptor.fields || {}).some(containsRef);
  if (descriptor.base === 'variant') return Object.values(descriptor.payloads || {}).some(containsRef);
  return false;
}

// ISO-8601 duration -> milliseconds: the one duration parser (deadline
// facets, duration arithmetic, and scans all parse through here).
export function durationMs(value) {
  if (typeof value === 'number') return value;
  const match = String(value || '').match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
  if (!match) throw new Error(`Invalid ISO-8601 duration ${value}`);
  return (Number(match[1] || 0) * 86_400 + Number(match[2] || 0) * 3_600
    + Number(match[3] || 0) * 60 + Number(match[4] || 0)) * 1_000;
}
