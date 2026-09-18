// Screen composition (see README.md): projects a compiled screen contract
// plus a CTS client bundle and an instance pool into a pure render tree.
// No Vue here — the components/ui-mapping layer materializes this tree.
import { resolveSurface } from './index.js';

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
  const byId = pool[source.entityType] || {};
  const id = screen.scope?.entityId;
  if (id && byId[id]) return byId[id];
  return Object.values(byId)[0] || null;
}

function resolveList(source, screen, pool, sourcesById) {
  const byId = pool[source.entityType] || {};
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

function composeRegion(region, screen, contract, pool, typesById, depth) {
  const sourcesById = Object.fromEntries((screen.sources || []).map(source => [source.id, source]));
  const source = sourcesById[region.sourceId] || {};
  const surfaceKind = surfaceKindOf(region, source);
  const single = surfaceKind === 'detail' ? resolveSingle(source, screen, pool) : null;
  const instances = single ? [single] : resolveList(source, screen, pool, sourcesById);
  const type = typesById[source.entityType] || null;
  const variant = surfaceKind === 'detail' ? (depth === 0 ? 'full' : 'detail') : 'row';
  const childRegions = (screen.regions || [])
    .filter(child => child.slot === 'children' && child.id !== region.id)
    .map(child => composeRegion(child, screen, contract, pool, typesById, depth + 1));
  return Object.freeze({
    id: region.id,
    slot: region.slot,
    surfaceKind,
    entityType: source.entityType || null,
    type,
    variant,
    surface: type ? resolveSurface(type, { variant }) : null,
    instances: Object.freeze(instances),
    actions: Object.freeze((region.actions || []).map(actionId => contract.actions?.[actionId]).filter(Boolean)),
    childRegions: Object.freeze(childRegions)
  });
}

// composeScreen(screen, contract, bundle, pool) -> pure region tree. The
// bundle supplies surface/preview policy per entity type; the pool is the
// data layer stand-in ({ type -> { id -> instance } }). List sources may
// scope by `relation: { sourceId, key }` or `lineage: { sourceId, key }`.
export function composeScreen(screen = {}, contract = { actions: {} }, bundle = { types: [] }, pool = {}) {
  const typesById = Object.fromEntries((bundle.types || []).map(type => [type.id, type]));
  const regions = (screen.regions || [])
    .filter(region => region.slot !== 'children')
    .map((region, index) => composeRegion(region, screen, contract, pool, typesById, index === 0 ? 0 : 1));
  return Object.freeze({
    key: screen.screenKey || screen.id,
    template: screen.template,
    label: screen.label,
    entityType: screen.entityType || null,
    type: typesById[screen.entityType] || null,
    regions: Object.freeze(regions)
  });
}
