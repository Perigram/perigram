// Screen composition: projects a compiled screen contract
// plus a CTS client bundle and an instance pool into a pure render tree.
// No Vue here — the components/ui-mapping layer materializes this tree.
import { resolveSurface, arrangeChildren, TAB_ANCESTOR_NONE, regionSideSpanFor, regionDataTraits, estimateRegionWeight, resolveListControls, SIDE_MAX_WEIGHT } from './index.js';
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
  // A fetch outcome describes the fetch, not the data: reported empty or
  // missing yields to rows the pool gained after it (a created record
  // lands in the pool with a snapshot while the screen stays mounted).
  // Loading/denied/error stay authoritative.
  if (provided && provided !== 'ready'
    && !(instances.length && (provided === 'empty' || provided === 'missing'))) return provided;
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
  // Surface context law: the containment cross-cut composes on unscoped
  // class lists only — a source scoped by relation, lineage, or pinned
  // filters renders inside the surface that already states its parent.
  const scoped = Boolean(source.relation || source.lineage
    || (source.filters && Object.keys(source.filters).length));
  const crossCut = surfaceKind === 'list' && !scoped;
  const ownActions = Object.freeze((region.actions || []).map(actionId => contract.actions?.[actionId]).filter(Boolean));
  // SPEC §22.12: relation link/unlink are section-scoped. Each injects
  // into the relation-scoped child region rendering its target type,
  // carrying the parent instance for the row run context; the parent
  // detail keeps a link action only when no section consumed it.
  const relationTargetsOf = action => [].concat(
    action.relationMutation?.targetTypes || action.relation?.targetTypes || []
  );
  const relationKeyOf = action => action.relationMutation?.key || action.relation?.key || '';
  const isRelationMutationAction = action => action?.actionKind === 'link' || action?.actionKind === 'unlink';
  const relationActionsFor = child => {
    if (!single || !child.relationKey || !child.typeId) return [];
    return ownActions.filter(action => isRelationMutationAction(action)
      && relationKeyOf(action) === child.relationKey
      && relationTargetsOf(action).includes(child.typeId));
  };
  const composedChildren = region.slot === 'children' ? [] : (screen.regions || [])
    .filter(child => child.slot === 'children' && child.id !== region.id)
    .map(child => {
      const composed = composeRegion(child, screen, contract, pool, typesById, depth + 1, providedStates);
      const injected = relationActionsFor(composed);
      return injected.length
        ? Object.freeze({ ...composed, actions: Object.freeze([...composed.actions, ...injected]), relationParent: single })
        : composed;
    });
  const sectionConsumedActionIds = new Set(composedChildren
    .flatMap(child => child.actions.filter(isRelationMutationAction))
    .map(action => action.id));
  // Content-aware arrangement (SPEC §Generative UI, 2026-10-22): an
  // empty child collection is layout-inert — arrangement, the side
  // rail, and columns see only filled children; empty ones render as
  // compact stubs below the arranged content (`stubRegions`).
  const childRegions = composedChildren.filter(child => child.instances.length > 0);
  const stubRegions = composedChildren.filter(child => child.instances.length === 0);
  // Data traits (SPEC → Data traits): the compose-time record arrangement
  // consumes, derived pure over the type record and the loaded pool.
  const dataTraits = regionDataTraits({
    surfaceKind,
    type,
    instances,
    statePolicy: contract.statePolicy?.[source.typeId] || null
  });
  return Object.freeze({
    id: region.id,
    slot: region.slot,
    surfaceKind,
    dataState: dataStateFor(source, surfaceKind, instances, providedStates),
    level: depth,
    dataTraits,
    relationKey: source.relation?.key || null,
    lineageKey: source.lineage?.key || null,
    crossCut,
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
    listControls: surfaceKind === 'list' && type ? resolveListControls(type, instances, { pool }) : null,
    instances: Object.freeze(instances),
    actions: Object.freeze(ownActions.filter(action => !sectionConsumedActionIds.has(action.id))),
    childRegions: Object.freeze(childRegions),
    stubRegions: Object.freeze(stubRegions)
  });
}

// Arrangement applies top down (SPEC §22.1): tabs sit at any tree level,
// and a tab arrangement at a step excludes tabs in its descendants at
// that step — the pass threads each step's tab ancestry into the child
// sets while composing their outcomes.
function tabAncestorOf(insideTabs, arrangement) {
  return Object.freeze({
    narrow: insideTabs.narrow || arrangement.narrow?.mode === 'tabs',
    medium: insideTabs.medium || arrangement.medium?.mode === 'tabs',
    wide: insideTabs.wide || arrangement.wide?.mode === 'tabs'
  });
}

// The record page is a document (SPEC §22.17): in the `record`
// presentation the depth-0 record's children resolve the inline stack at
// every width step. The ladder keeps deriving every other set (list
// screens, nested surfaces, and the whole tree under the `peek`
// presentation).
const STACK_ARRANGEMENT = Object.freeze({
  narrow: Object.freeze({ mode: 'stack' }),
  medium: Object.freeze({ mode: 'stack' }),
  wide: Object.freeze({ mode: 'stack' })
});

function withArrangement(node, insideTabs, presentation) {
  const childRegions = node.childRegions;
  const documentPage = presentation === 'record' && node.surfaceKind === 'detail' && node.level === 0;
  const childWeight = childRegions.reduce((sum, child) => sum + estimateRegionWeight(child), 0);
  const stepped = arrangeChildren(childRegions, insideTabs);
  // The rail rides BESIDE the body: the body must carry at least the
  // rail's weight, else the children flow below and the record keeps its
  // page (a thin record never hosts a hanging side column).
  const sideRail = !documentPage && node.surfaceKind === 'detail' && node.level === 0 && childRegions.length > 0
    && childWeight <= SIDE_MAX_WEIGHT
    && node.dataTraits.weight >= childWeight
    && childRegions.every(child => (child.dataTraits || regionDataTraits(child)).breadth !== 'full')
    ? Object.freeze({ mode: 'side', span: regionSideSpanFor(childWeight) })
    : null;
  const childArrangement = documentPage
    ? STACK_ARRANGEMENT
    : sideRail
      ? Object.freeze({ ...stepped, wide: sideRail })
      : stepped;
  const childInsideTabs = tabAncestorOf(insideTabs, childArrangement);
  return Object.freeze({
    ...node,
    childRegions: Object.freeze(childRegions.map(child => withArrangement(child, childInsideTabs, presentation))),
    stubRegions: Object.freeze(node.stubRegions.map(child => withArrangement(child, childInsideTabs, presentation))),
    childArrangement,
    sideRail
  });
}

// screenWeight(composed): the total estimated rendered rows of a composed
// screen over its whole region tree — the data term the spacing
// coefficient's density budget consumes.
export function screenWeight(screen = {}) {
  const walk = regions => (regions || []).reduce((sum, region) => sum
    + estimateRegionWeight(region)
    + walk(region.childRegions)
    + walk(region.stubRegions), 0);
  return walk(screen.regions);
}

// The section key of a record document's child region (SPEC §26): a
// relation-scoped child addresses its relation key — the same key the
// relation's inline chip section would carry, whichever renders it — and
// a lineage-scoped child addresses its lineage key plus its child type
// (one parent may hold several child types under one edge key), else its
// child type.
export function recordChildSectionKey(region = {}) {
  if (region.relationKey) return `relation:${region.relationKey}`;
  return `children:${region.lineageKey ? `${region.lineageKey}:${region.typeId || region.id}` : (region.typeId || region.id)}`;
}

// The record document's section flow under an instance overlay (SPEC
// §26): the authored order decides, declared content always renders — a
// declared key the order omits appends in derivation order, an order
// entry naming no current section or block drops, a stored block its
// order omits appends — so the arrangement survives new declared
// sections and declared blocks reorder and never delete. A null overlay
// leaves the derivation order untouched.
export function composeDocumentSections(declaredKeys = [], overlay = null) {
  const blocks = Array.isArray(overlay?.blocks) ? overlay.blocks : [];
  const blockById = new Map(blocks.map(block => [block.id, block]));
  const known = new Set([...declaredKeys, ...blockById.keys()]);
  const ordered = [];
  const seen = new Set();
  const push = key => {
    if (known.has(key) && !seen.has(key)) {
      seen.add(key);
      ordered.push(key);
    }
  };
  for (const key of Array.isArray(overlay?.order) ? overlay.order : []) push(key);
  for (const key of declaredKeys) push(key);
  for (const block of blocks) push(block.id);
  return ordered.map(key => (blockById.has(key)
    ? { key, block: blockById.get(key) }
    : { key, block: null }));
}

// composeScreen(screen, contract, bundle, pool, options) -> pure region
// tree. The bundle supplies surface/preview policy per entity type; the
// pool is the data layer stand-in ({ type -> { id -> instance } }). List
// sources may scope by `relation: { sourceId, key }` or `lineage: {
// sourceId, key }`. `options.sourceStates` optionally maps source ids to
// runtime data states ('loading' | 'ready' | 'empty' | 'denied' |
// 'error'); unreported sources derive their state from the pool.
// `options.presentation` selects the depth-0 record treatment's
// arrangement ('record', the default, resolves the document stack of
// SPEC §22.17; 'peek' keeps the ladder).
export function composeScreen(screen = {}, contract = { actions: {} }, bundle = { types: [] }, pool = {}, options = {}) {
  const typesById = Object.fromEntries((bundle.types || []).map(type => [type.id, type]));
  const providedStates = options.sourceStates || null;
  const presentation = options.presentation || 'record';
  // Every top-level region sits at depth 0 — the tree position decides
  // chrome and variant, never the region's index in the contract. Screen
  // sections arrange through the same ordered rules record children do.
  const composed = (screen.regions || [])
    .filter(region => region.slot !== 'children')
    .map(region => composeRegion(region, screen, contract, pool, typesById, 0, providedStates));
  // Inert partition (SPEC rule 1): a list section that resolved empty
  // leaves the arrangement and renders as a compact stub below it;
  // loading, denied, and error sections keep their state surfaces in the
  // ladder.
  const inertSection = region => !options.keepEmptyLists
    && region.surfaceKind === 'list' && region.instances.length === 0
    && region.dataState === 'empty';
  const activeRegions = composed.filter(region => !inertSection(region));
  const stubRegions = composed.filter(inertSection);
  // A tabbed sections step places every top-level region inside a tab at
  // that step, so their own child sets exclude tabs there.
  const regionsArrangement = arrangeChildren(activeRegions, TAB_ANCESTOR_NONE);
  const insideTabs = tabAncestorOf(TAB_ANCESTOR_NONE, regionsArrangement);
  const regions = activeRegions.map(region => withArrangement(region, insideTabs, presentation));
  return Object.freeze({
    key: screen.screenKey || screen.id,
    template: screen.template,
    label: screen.label,
    typeId: screen.typeId || null,
    type: typesById[screen.typeId] || null,
    regions: Object.freeze(regions),
    stubRegions: Object.freeze(stubRegions.map(region => withArrangement(region, insideTabs, presentation))),
    regionsArrangement
  });
}
