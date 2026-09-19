// Screen composition (see README.md): projects a compiled screen contract
// plus a CTS client bundle and an instance pool into a pure render tree.
// No Vue here — the components/ui-mapping layer materializes this tree.
import { resolveSurface, resolveChrome, childrenModeFor, estimateRegionWeight, screenDensityFor, resolveListControls } from './index.js';

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
  if (id && byId[id]) return byId[id];
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
    return list.map(ref => pool[ref.type]?.[ref.id]).filter(Boolean);
  }
  if (source.lineage) {
    const originSource = sourcesById[source.lineage.sourceId];
    const origin = originSource ? resolveSingle(originSource, screen, pool) : null;
    if (!origin) return [];
    return Object.values(byId).filter(instance => instance.lineage?.[source.lineage.key]?.id === origin.id);
  }
  return Object.values(byId);
}

function surfaceKindOf(region, source) {
  if (source.mode === 'single' || region.surface === 'detail') return 'detail';
  return 'list';
}

function composeRegion(region, screen, contract, pool, typesById, depth, providedStates) {
  const sourcesById = Object.fromEntries((screen.sources || []).map(source => [source.id, source]));
  const source = sourcesById[region.sourceId] || {};
  const surfaceKind = surfaceKindOf(region, source);
  const single = surfaceKind === 'detail' ? resolveSingle(source, screen, pool) : null;
  const instances = single ? [single] : resolveList(source, screen, pool, sourcesById);
  const type = typesById[source.typeId] || null;
  const variant = surfaceKind === 'detail' ? (depth === 0 ? 'full' : 'detail') : 'row';
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
    weight: estimateRegionWeight({ surfaceKind, type, instances }),
    relationKey: source.relation?.key || null,
    lineageKey: source.lineage?.key || null,
    typeId: source.typeId || null,
    type,
    variant,
    surface: type ? resolveSurface(type, { variant }) : null,
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
