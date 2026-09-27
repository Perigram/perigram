// Screen composition (see README.md): projects a compiled screen contract
// plus a CTS client bundle and an instance pool into a pure render tree.
// No Vue here — the components/ui-mapping layer materializes this tree.
import { resolveSurface, resolveChrome, childrenModeFor, estimateRegionWeight, screenDensityFor, resolveListControls } from './index.js';
import { filterFromFlatFilters, instanceMatchesFilter } from '#shared/instance-filters/index.js';

// Region data state: the data layer may report per-source states
// ('loading' | 'ready' | 'empty' | 'denied' | 'error'); otherwise the
// state derives purely from the pool — an empty list source is 'empty', a
// single source without a resolved instance is 'missing', anything else
// with instances is 'ready'.
function dataStateFor(source, surfaceKind, instances, providedStates) {
  const provided = providedStates?.[source.id];
  if (provided) return provided;
  if (instances.length) return 'ready';
  return surfaceKind === 'detail' ? 'missing' : 'empty';
}

export function buildInstancePool(instances = {}) {
  const pool = {};
  for (const group of Object.values(instances)) {
    for (const instance of group) {
      (pool[instance.type] ||= {})[instance.id] = instance;
    }
  }
  return pool;
}

function resolveSingle(source, screen, pool) {
  const byId = pool[source.typeId] || {};
  const id = screen.scope?.instanceId;
  // The screen's own scoped instance is explicit: when it is not in the
  // pool the source is missing, never a guess at the first loaded record.
  // Sources of another type (relation/lineage origins) keep the fallback.
  if (id && (!screen.typeId || screen.typeId === source.typeId)) {
    return byId[id] || null;
  }
  return Object.values(byId)[0] || null;
}

function resolveList(source, screen, pool, sourcesById, typesById = {}) {
  const byId = pool[source.typeId] || {};
  if (source.relation) {
    const originSource = sourcesById[source.relation.sourceId];
    const origin = originSource ? resolveSingle(originSource, screen, pool) : null;
    if (!origin) return [];
    const refs = origin.relations?.[source.relation.key];
    const list = Array.isArray(refs) ? refs : refs ? [refs] : [];
    return list
      .map(ref => pool[ref?.type || source.typeId]?.[ref?.id ?? ref])
      .filter(Boolean);
  }
  if (source.lineage) {
    const originSource = sourcesById[source.lineage.sourceId];
    const origin = originSource ? resolveSingle(originSource, screen, pool) : null;
    if (!origin) return [];
    return Object.values(byId).filter(instance => {
      const ref = instance.lineage?.[source.lineage.key];
      const value = ref?.id ?? ref;
      return value !== null && value !== undefined && String(value) === String(origin.id);
    });
  }
  if (source.filters) {
    // The compiler-emitted child-region shape: flat scalar filters whose
    // `$screen.*` placeholders resolve against the routed screen scope.
    // The flat map is the transport projection of the canonical filter
    // tree (#shared/instance-filters): bare keys are lineage keys — no
    // declared-vocabulary gate client-side, the total default generated
    // screens were pinned against — and matching runs through the one
    // in-memory matcher, mirroring the server transport's semantics.
    // An unresolved $screen placeholder means the scope the source is
    // pinned to is unknown here: the source resolves no instances rather
    // than every instance of the type.
    const { filters, unresolved } = resolveFilterPlaceholders(source.filters, screen);
    if (unresolved) return [];
    const filter = filterFromFlatFilters(filters);
    // An empty resolved filter carries no scope (compiled type lists ship
    // `filters: {}`): the source is unscoped and takes the root-scoped
    // listing below, never the whole type in one pile.
    if (filter) {
      return Object.values(byId).filter(instance => instanceMatchesFilter(instance, filter));
    }
  }
  // An unscoped list is a type-level surface: when the type can be
  // someone's child (a declared children edge names it), only root
  // instances list — children ride nested under their parents, never
  // duplicated at the top level.
  const scopeKeys = rootScopeKeysFor(source.typeId, typesById);
  if (!scopeKeys.size) return Object.values(byId);
  return Object.values(byId).filter(instance => isRootInstance(instance, scopeKeys));
}

function resolveFilterPlaceholders(filters = {}, screen = {}) {
  let unresolved = false;
  const resolved = Object.fromEntries(Object.entries(filters || {}).map(([key, value]) => {
    if (typeof value !== 'string' || !value.startsWith('$screen.')) return [key, value];
    const screenValue = screenPath(screen, value.slice('$screen.'.length));
    if (screenValue === undefined || screenValue === null || screenValue === '') unresolved = true;
    return [key, screenValue];
  }));
  return { filters: resolved, unresolved };
}

function screenPath(screen = {}, path = '') {
  return String(path).split('.').filter(Boolean).reduce((value, key) => (value == null ? undefined : value[key]), screen);
}

function surfaceKindOf(region, source) {
  if (source.mode === 'single' || region.surface === 'detail') return 'detail';
  return 'list';
}

// Declared lineage keys through which this type can be someone's child
// (any type's children edge naming it, self-referential included). A type
// with no incoming children edge has no root scope — every instance lists.
function rootScopeKeysFor(typeId = '', typesById = {}) {
  const keys = new Set();
  for (const type of Object.values(typesById || {})) {
    for (const edge of Object.values(type?.edges?.children || {})) {
      if ((edge?.types || []).includes(typeId) && edge?.lineageKey) keys.add(edge.lineageKey);
    }
  }
  return keys;
}

function isRootInstance(instance = {}, scopeKeys = new Set()) {
  for (const key of scopeKeys) {
    const ref = instance.lineage?.[key];
    const value = ref?.id ?? ref;
    if (value !== null && value !== undefined && value !== '') return false;
  }
  return true;
}

function composeRegion(region, screen, contract, pool, typesById, depth, providedStates) {
  const sourcesById = Object.fromEntries((screen.sources || []).map(source => [source.id, source]));
  const source = sourcesById[region.sourceId] || {};
  const surfaceKind = surfaceKindOf(region, source);
  const single = surfaceKind === 'detail' ? resolveSingle(source, screen, pool) : null;
  // A detail source renders its resolved instance or nothing — it never
  // falls back to listing the whole type.
  const instances = surfaceKind === 'detail'
    ? (single ? [single] : [])
    : resolveList(source, screen, pool, sourcesById, typesById);
  const type = typesById[source.typeId] || null;  const variant = surfaceKind === 'detail' ? (depth === 0 ? 'full' : 'detail') : 'row';
  const containerRole = depth === 0 ? 'section' : 'card';
  const chrome = resolveChrome(containerRole, depth === 0 ? null : 'section');
  const childRegions = region.slot === 'children' ? [] : (screen.regions || [])
    .filter(child => child.slot === 'children' && child.id !== region.id)
    .map(child => composeRegion(child, screen, contract, pool, typesById, depth + 1, providedStates));
  const childrenMode = childrenModeFor(childRegions, depth);
  return Object.freeze({
    id: region.id,
    slot: region.slot,
    surfaceKind,
    dataState: dataStateFor(source, surfaceKind, instances, providedStates),
    chrome,
    level: depth,
    childrenMode,
    weight: estimateRegionWeight({
      surfaceKind,
      type,
      instances,
      statePolicy: contract.statePolicy?.[source.typeId] || null
    }),
    relationKey: source.relation?.key || null,
    lineageKey: source.lineage?.key || null,
    typeId: source.typeId || null,
    type,
    variant,
    surface: type ? resolveSurface(type, { variant }) : null,
    // The compiled process contract's flat state vocabulary for this
    // region's type (SPEC §7 — types carry none); null means the type has
    // no authored states and its surfaces render no state chrome.
    statePolicy: contract.statePolicy?.[source.typeId] || null,
    // The same contract's authored machine edges (stateTransitionsByType
    // over the producer workflows): the board projection's legal-move
    // map, carried beside the vocabulary it walks.
    stateTransitions: contract.stateTransitions?.[source.typeId] || null,
    listControls: surfaceKind === 'list' && type ? resolveListControls(type, instances) : null,
    instances: Object.freeze(instances),
    actions: Object.freeze((region.actions || []).map(actionId => contract.actions?.[actionId]).filter(Boolean)),
    childRegions: Object.freeze(childRegions)
  });
}

// composeScreen(screen, contract, bundle, pool, options) -> pure region
// tree. The bundle supplies surface/preview policy per entity type; the
// pool is the data layer stand-in ({ type -> { id -> instance } }). List
// sources may scope by `relation: { sourceId, key }` or `lineage: {
// sourceId, key }`. `options.sourceStates` optionally maps source ids to
// runtime data states ('loading' | 'ready' | 'empty' | 'denied' |
// 'error'); unreported sources derive their state from the pool.
export function composeScreen(screen = {}, contract = { actions: {} }, bundle = { types: [] }, pool = {}, options = {}) {
  const typesById = Object.fromEntries((bundle.types || []).map(type => [type.id, type]));
  const providedStates = options.sourceStates || null;
  const regions = (screen.regions || [])
    .filter(region => region.slot !== 'children')
    .map((region, index) => composeRegion(region, screen, contract, pool, typesById, index === 0 ? 0 : 1, providedStates));
  const totalWeight = regions.reduce((sum, region) => sum + region.weight
    + region.childRegions.reduce((childSum, child) => childSum + child.weight, 0), 0);
  const density = screenDensityFor(totalWeight, options.densityBias || 0);
  return Object.freeze({
    key: screen.screenKey || screen.id,
    template: screen.template,
    label: screen.label,
    typeId: screen.typeId || null,
    type: typesById[screen.typeId] || null,
    regions: Object.freeze(regions.map(region => Object.freeze({ ...region, density }))),
    regionsMode: childrenModeFor(regions, 0),
    density
  });
}
