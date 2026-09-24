// Canonical instance-filter vocabulary (see README.md): one structured
// filter tree the server list transport, the generated-screen composition,
// and the collection toolbar all speak. Pure data and pure functions — no
// Vue, Nuxt, Mongo, or domain imports. The flat transport map compiled
// screen sources emit is a PROJECTION of this tree, normalized here and
// nowhere else.

// Operators exist because a consumer expresses them; the set grows only
// when a consumer needs a new one.
export const FILTER_OPS = Object.freeze(['eq', 'in', 'contains']);

const TRANSPORT_PARAMETER_KEYS = new Set(['limit', 'skip']);
const LINEAGE_PREFIX = 'lineage.';

function isPresent(value) {
  return value !== null && value !== undefined && value !== '';
}

function normalizePredicate(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return null;
  const { field, op, value } = node;
  if (typeof field !== 'string' || !field.trim()) return null;
  if (!FILTER_OPS.includes(op)) return null;
  if (op === 'in') {
    if (!Array.isArray(value) || !value.length) return null;
  } else if (!isPresent(value)) {
    return null;
  }
  return Object.freeze({ field: field.trim(), op, value });
}

// normalizeFilter(node): total, deterministic normalization. Empty values,
// unknown operators, and malformed shapes drop as no-ops; combinators with
// no surviving children collapse (an empty conjunction is the match-all
// null); single-child combinators collapse to the child. The result is
// frozen and never mutates the input.
export function normalizeFilter(node) {
  const predicate = normalizePredicate(node);
  if (predicate) return predicate;
  if (!node || typeof node !== 'object' || Array.isArray(node)) return null;
  if (node.and || node.or) {
    const combinator = node.and ? 'and' : 'or';
    const children = (Array.isArray(node[combinator]) ? node[combinator] : [])
      .map(normalizeFilter)
      .filter(Boolean);
    if (!children.length) return null;
    if (children.length === 1) return children[0];
    return Object.freeze({ [combinator]: Object.freeze(children) });
  }
  if (node.not) {
    const child = normalizeFilter(node.not);
    return child ? Object.freeze({ not: child }) : null;
  }
  return null;
}

// filterFromFlatFilters(flat, { lineageKeys }): the transport projection.
// The flat scalar map compiled screen sources carry expands into one
// conjunction: `_id`, `primaryState`, CSV `primaryStates`, and declared
// lineage keys (bare or `lineage.`-dotted). `limit`/`skip` are transport
// parameters and drop; empty values drop; a repeated key contributes its
// first entry. `lineageKeys` is the caller's declared-vocabulary gate: with
// a set, an undeclared key is transport noise and never becomes a
// predicate; without one every bare key reads as a lineage key (the client
// default the generated screens were pinned against).
export function filterFromFlatFilters(filters = {}, { lineageKeys = null } = {}) {
  const declared = lineageKeys instanceof Set ? lineageKeys : null;
  const predicates = [];
  for (const [key, rawValue] of Object.entries(filters || {})) {
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    if (!isPresent(value)) continue;
    if (TRANSPORT_PARAMETER_KEYS.has(key)) continue;
    if (key === '_id') {
      predicates.push({ field: '_id', op: 'eq', value });
      continue;
    }
    if (key === 'primaryState') {
      predicates.push({ field: 'states.main', op: 'eq', value: String(value) });
      continue;
    }
    if (key === 'primaryStates') {
      const values = String(value).split(',').map(item => item.trim()).filter(Boolean);
      if (values.length) predicates.push({ field: 'states.main', op: 'in', value: values });
      continue;
    }
    const bareKey = key.startsWith(LINEAGE_PREFIX) ? key.slice(LINEAGE_PREFIX.length) : key;
    if (declared && !declared.has(bareKey)) continue;
    predicates.push({ field: `${LINEAGE_PREFIX}${bareKey}`, op: 'eq', value });
  }
  return normalizeFilter(predicates.length ? { and: predicates } : null);
}

// Address resolution reads the CTS §3 instance shape, never storage paths:
// the instance id, the primary status, lineage ref ids, and flat fields
// (quantities compare by their `.value`).
function readFilterValue(instance, field) {
  if (field === '_id' || field === 'id') return instance?.id ?? null;
  if (field === 'states.main') return instance?.states?.main ?? null;
  if (field.startsWith(LINEAGE_PREFIX)) {
    const ref = instance?.lineage?.[field.slice(LINEAGE_PREFIX.length)];
    return ref?.id ?? ref ?? null;
  }
  const value = instance?.fields?.[field];
  if (value && typeof value === 'object' && !Array.isArray(value) && 'value' in value) {
    return value.value ?? null;
  }
  return value ?? null;
}

function predicateMatches(instance, predicate) {
  const actual = readFilterValue(instance, predicate.field);
  if (predicate.op === 'eq') {
    return String(actual ?? '') === String(predicate.value ?? '');
  }
  if (predicate.op === 'in') {
    return predicate.value.some(candidate => String(candidate) === String(actual ?? ''));
  }
  if (actual === null || actual === undefined) return false;
  return String(actual).toLowerCase().includes(String(predicate.value).toLowerCase());
}

// instanceMatchesFilter(instance, node): the one in-memory matcher. A null
// filter is the match-all; malformed input normalizes to no-ops instead of
// failing the surface.
export function instanceMatchesFilter(instance, node) {
  const filter = normalizeFilter(node);
  if (!filter) return true;
  if (filter.and) return filter.and.every(child => instanceMatchesFilter(instance, child));
  if (filter.or) return filter.or.some(child => instanceMatchesFilter(instance, child));
  if (filter.not) return !instanceMatchesFilter(instance, filter.not);
  return predicateMatches(instance, filter);
}
