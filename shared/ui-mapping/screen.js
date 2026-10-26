// Screen composition: projects a compiled screen contract
// plus a CTS client bundle and an instance pool into a pure render tree.
// No Vue here — the components/ui-mapping layer materializes this tree.
import { resolveSurface, resolveChrome, arrangeChildren, regionSideSpanFor, estimateRegionWeight, resolveListControls, childrenModeFor, SIDE_MAX_WEIGHT } from './index.js';
import { filterFromFlatFilters, instanceMatchesFilter } from '#shared/instance-filters/index.js';

// Region data state: the data layer may report per-source states
// ('loading' | 'ready' | 'empty' | 'denied' | 'error'); otherwise the
// state derives purely from the pool — an empty list source is 'empty', a
// single source without a resolved instance is 'missing', anything else
// with instances is 'ready'. A reported 'ready' never wins over the
// pool-derived state: readiness is resolved instances, so a data layer
// counting a non-empty type bucket cannot upgrade a single source whose
// scoped instance is absent past 'missing'.
function dataStateFor(source, surfaceKind, instances, providedStates) {
  const provided = providedStates?.[source.id];
  if (provided && provided !== 'ready') return provided;
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

function resolveList(source, screen, pool, sourcesById) {
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
    // `filters: {}`): the source is unscoped and takes the cross-cut
    // listing below.
    if (filter) {
      return Object.values(byId).filter(instance => instanceMatchesFilter(instance, filter));
    }
  }
  // An unscoped list is a type-level surface. A type someone's children
  // edge names composes the containment cross-cut: every instance lists
  // with its declared parent context (`incomingChildrenEdges` — the
  // materialization renders the parent from it), because this surface
  // cannot nest — the parent surface owns nesting through the tree
  // projection. Any other type keeps the total list.
  return Object.values(byId);
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
// live in `incomingChildrenEdges` (index.js) — the cross-cut and the
// pickers resolve the same declaration home the tree nests through.

function composeRegion(region, screen, contract, pool, typesById, depth, providedStates) {
  const sourcesById = Object.fromEntries((screen.sources || []).map(source => [source.id, source]));
  const source = sourcesById[region.sourceId] || {};
  const surfaceKind = surfaceKindOf(region, source);
  const single = surfaceKind === 'detail' ? resolveSingle(source, screen, pool) : null;
  // A detail source renders its resolved instance or nothing — it never
  // falls back to listing the whole type.
  const instances = surfaceKind === 'detail'
    ? (single ? [single] : [])
    : resolveList(source, screen, pool, sourcesById);
  const type = typesById[source.typeId] || null;
  const variant = surfaceKind === 'detail' ? (depth === 0 ? 'full' : 'detail') : 'row';
  const containerRole = depth === 0 ? 'section' : 'card';
  const chrome = resolveChrome(containerRole, depth === 0 ? null : 'section');
  const composedChildren = region.slot === 'children' ? [] : (screen.regions || [])
    .filter(child => child.slot === 'children' && child.id !== region.id)
    .map(child => composeRegion(child, screen, contract, pool, typesById, depth + 1, providedStates));
  // Content-aware arrangement (SPEC §Generative UI, 2026-10-22): an
  // empty child collection is layout-inert — arrangement, the side
  // rail, and columns see only filled children; empty ones render as
  // compact stubs below the arranged content (`stubRegions`).
  const childRegions = composedChildren.filter(child => child.instances.length > 0);
  const stubRegions = composedChildren.filter(child => child.instances.length === 0);
  return Object.freeze({
    id: region.id,
    slot: region.slot,
    surfaceKind,
    dataState: dataStateFor(source, surfaceKind, instances, providedStates),
    chrome,
    level: depth,
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
    childRegions: Object.freeze(childRegions),
    stubRegions: Object.freeze(stubRegions)
  });
}

// Arrangement applies top down (SPEC §22.1): tabs sit at any level, and
// a sibling set inside a tab arrangement stacks. Sibling arrangement is
// weight-driven (arrangeChildren); a depth-0 record body carries a
// light stack-mode child set beside it in a weight-proportional side
// column.
function withArrangement(node, insideTabs) {
  const childRegions = node.childRegions.map(child => withArrangement(child, insideTabs));
  const childWeight = childRegions.reduce((sum, child) => sum + estimateRegionWeight(child), 0);
  const childArrangement = arrangeChildren(childRegions, insideTabs);
  const besideBody = node.surfaceKind === 'detail' && node.level === 0 && childRegions.length > 0
    && childArrangement.mode === 'stack' && childWeight <= SIDE_MAX_WEIGHT;
  const sideSpan = besideBody ? regionSideSpanFor(childWeight) : 0;
  const tabbed = insideTabs || childArrangement.mode === 'tabs';
  return Object.freeze({
    ...node,
    childRegions: Object.freeze(childRegions),
    stubRegions: Object.freeze(node.stubRegions.map(child => withArrangement(child, tabbed))),
    childArrangement,
    besideBody,
    sideSpan
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
  // Every top-level region sits at depth 0 — the tree position decides
  // chrome and variant, never the region's index in the contract.
  const composed = (screen.regions || [])
    .filter(region => region.slot !== 'children')
    .map(region => composeRegion(region, screen, contract, pool, typesById, 0, providedStates));
  // A tabbed sections arrangement places every top-level region inside a
  // tab, so their own children arrange with tabs excluded.
  const regionsMode = childrenModeFor(composed);
  const regions = composed.map(region => withArrangement(region, regionsMode === 'tabs'));
  return Object.freeze({
    key: screen.screenKey || screen.id,
    template: screen.template,
    label: screen.label,
    typeId: screen.typeId || null,
    type: typesById[screen.typeId] || null,
    regions: Object.freeze(regions),
    regionsMode
  });
}
