// Canonical instance-filter vocabulary: one structured
// filter tree the server list transport, the generated-screen composition,
// and the collection toolbar all speak. Pure data and pure functions — no
// Vue, Nuxt, Mongo, or domain imports. The flat transport map compiled
// screen sources emit is a PROJECTION of this tree, normalized here and
// nowhere else.

// Operators exist because a consumer expresses them; the set grows only
// when a consumer needs a new one.
export const FILTER_OPS = Object.freeze(['eq', 'in', 'contains', 'gt', 'gte', 'lt', 'lte']);

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

// countPredicates(node): the predicate count of a tree — the condition
// count a collection surface badges its view control with.
export function countPredicates(node) {
  if (!node || typeof node !== 'object') return 0;
  if (node.and) return node.and.reduce((sum, child) => sum + countPredicates(child), 0);
  if (node.or) return node.or.reduce((sum, child) => sum + countPredicates(child), 0);
  if (node.not) return countPredicates(node.not);
  return 1;
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
      predicates.push({ field: 'state', op: 'eq', value: String(value) });
      continue;
    }
    if (key === 'primaryStates') {
      const values = String(value).split(',').map(item => item.trim()).filter(Boolean);
      if (values.length) predicates.push({ field: 'state', op: 'in', value: values });
      continue;
    }
    if (/^states\.[^.]+$/.test(key)) {
      predicates.push({ field: key, op: 'eq', value: String(value) });
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
// (quantities compare by their `.value`). Traversal addresses read RELATED
// instances through the caller's pool: `relations.<key>.<field>` (any
// target of the relation), `lineage.<key>.<field>` (the ancestor stored
// under the key), and `children.<type>.<field>` (any pool instance of the
// type whose lineage points back). One hop only.
const RELATIONS_PREFIX = 'relations.';
const CHILDREN_PREFIX = 'children:';

function traversalAddress(field = '') {
  if (field.startsWith(RELATIONS_PREFIX)) {
    const rest = field.slice(RELATIONS_PREFIX.length).split('.');
    if (rest.length === 2 && rest[0] && rest[1]) return { kind: 'relations', key: rest[0], field: rest[1] };
  }
  if (field.startsWith(LINEAGE_PREFIX)) {
    const rest = field.slice(LINEAGE_PREFIX.length).split('.');
    if (rest.length === 2 && rest[0] && rest[1]) return { kind: 'lineage', key: rest[0], field: rest[1] };
  }
  if (field.startsWith('children.')) {
    const rest = field.slice('children.'.length).split('.');
    if (rest.length === 2 && rest[0] && rest[1]) return { kind: 'children', key: rest[0], field: rest[1] };
  }
  return null;
}

function poolInstance(pool, type, id) {
  const resolved = pool?.[type]?.[String(id ?? '')];
  return resolved ?? null;
}

function poolById(pool, id) {
  if (!pool) return null;
  for (const byId of Object.values(pool)) {
    const hit = byId[String(id ?? '')];
    if (hit) return hit;
  }
  return null;
}

function relatedInstances(instance, address, pool) {
  if (!pool || !address) return [];
  if (address.kind === 'relations') {
    const refs = instance?.relations?.[address.key];
    const list = Array.isArray(refs) ? refs : refs ? [refs] : [];
    return list.map(ref => poolInstance(pool, ref?.type, ref?.id ?? ref)).filter(Boolean);
  }
  if (address.kind === 'lineage') {
    const ref = instance?.lineage?.[address.key];
    const resolved = ref == null ? null : poolById(pool, ref?.id ?? ref);
    return resolved ? [resolved] : [];
  }
  // children: any pool instance of the type whose lineage points back here
  const parentId = instance?.id;
  if (!parentId) return [];
  return Object.values(pool?.[address.key] || {}).filter(child =>
    Object.values(child?.lineage || {}).some(ref => String(ref?.id ?? ref ?? '') === String(parentId)));
}

function readFilterValue(instance, field) {
  if (field === '_id' || field === 'id') return instance?.id ?? null;
  if (field === 'state') return instance?.state ?? instance?.states?.main ?? null;
  if (/^states\.[^.]+$/.test(field)) return instance?.states?.[field.slice('states.'.length)] ?? null;
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
  if (predicate.op === 'contains') {
    return String(actual).toLowerCase().includes(String(predicate.value).toLowerCase());
  }
  // Ordering: numeric when both sides parse as numbers, else lexicographic
  // (ISO instants compare correctly as strings).
  const left = Number(actual);
  const right = Number(predicate.value);
  const comparable = Number.isFinite(left) && Number.isFinite(right);
  const a = comparable ? left : String(actual);
  const b = comparable ? right : String(predicate.value);
  if (predicate.op === 'gt') return a > b;
  if (predicate.op === 'gte') return a >= b;
  if (predicate.op === 'lt') return a < b;
  return a <= b;
}

// instanceMatchesFilter(instance, node, { pool }): the one in-memory
// matcher. A null filter is the match-all; malformed input normalizes to
// no-ops instead of failing the surface. Traversal addresses need the
// caller's instance pool ({ type -> { id -> instance } }); without one
// they are no-ops, never failures.
export function instanceMatchesFilter(instance, node, context = {}) {
  const filter = normalizeFilter(node);
  if (!filter) return true;
  if (filter.and) return filter.and.every(child => instanceMatchesFilter(instance, child, context));
  if (filter.or) return filter.or.some(child => instanceMatchesFilter(instance, child, context));
  if (filter.not) return !instanceMatchesFilter(instance, filter.not, context);
  const address = traversalAddress(filter.field);
  if (address) {
    // Without a pool — or when the related instances are not loaded —
    // the axis is unresolvable: a no-op, never a failure.
    if (!context.pool) return true;
    const related = relatedInstances(instance, address, context.pool);
    if (!related.length) return true;
    return related.some(target => predicateMatches(target, { ...filter, field: address.field }));
  }
  return predicateMatches(instance, filter);
}
