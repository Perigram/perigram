export function generatedDetailScreenForTypeId({
  screens = [],
  typeId = '',
  preferredRoute = ''
} = {}) {
  const candidates = (Array.isArray(screens) ? screens : []).filter(screen => (
    screen?.template === 'instanceDetail'
    && screenHasSingleEntitySource(screen, typeId)
  ));
  if (!candidates.length) return null;
  return candidates.find(screen => screen.route === preferredRoute) || candidates[0];
}

export function generatedDetailActionIds({
  screens = [],
  typeId = '',
  preferredRoute = ''
} = {}) {
  const screen = generatedDetailScreenForTypeId({ screens, typeId, preferredRoute });
  if (!screen) return [];
  const mainRegion = detailMainRegion(screen, typeId);
  const actionIds = mainRegion?.actions?.length ? mainRegion.actions : screen.actions;
  return Array.isArray(actionIds) ? actionIds : [];
}

// The compiled typeList screen for a type: the synthesis base when the
// manifest carries no instanceDetail screen for the type.
export function typeListScreenForTypeId({ screens = [], typeId = '' } = {}) {
  return (Array.isArray(screens) ? screens : []).find(screen => (
    screen?.typeId === typeId && screen?.template === 'typeList'
  )) || null;
}

// Synthesize the missing detail screen from its list screen in the
// compiled UI contract vocabulary (instanceDetail + typeId), mirroring
// the routed surface fallback so workspace tabs render through the
// generator like compiler-paired detail screens.
export function synthesizeDetailScreen(base = null) {
  const typeId = base?.typeId;
  if (!base || !typeId) return null;
  const baseKey = base.screenKey || base.id || typeId;
  const sourceId = base.sources?.[0]?.id || typeId;
  const required = base.required || base.sources?.[0]?.required || null;
  return {
    ...base,
    id: `${base.id || baseKey}_detail`,
    screenKey: `${baseKey}_detail`,
    route: `/screens/${encodeURIComponent(`${baseKey}_detail`)}`,
    template: 'instanceDetail',
    placement: 'detail',
    sources: [{
      id: sourceId,
      typeId,
      mode: 'single',
      required,
      identifier: '$screen.scope.instanceId'
    }],
    regions: [{
      id: 'main',
      slot: 'main',
      sourceId,
      surface: 'detail',
      actions: base.actions || []
    }],
    actions: base.actions || []
  };
}

// Resolve the detail screen a workspace tab mounts for a type: the
// compiled instanceDetail screen first, the synthesized fallback second,
// null when the type has no list screen to synthesize from.
export function resolveDetailScreen({ screens = [], typeId = '' } = {}) {
  return generatedDetailScreenForTypeId({ screens, typeId })
    || synthesizeDetailScreen(typeListScreenForTypeId({ screens, typeId }));
}

// The record floor: a minimal single-source detail screen for a type
// with no compiled screen — the record popup's inspect surface over the
// served type view.
export function recordFloorScreen(typeId = '') {
  if (!typeId) return null;
  return synthesizeDetailScreen({ id: typeId, screenKey: typeId, typeId, sources: [{ id: typeId, typeId }] });
}

function detailMainRegion(screen = {}, typeId = '') {
  const regions = Array.isArray(screen.regions) ? screen.regions : [];
  return regions.find(region => (
    region?.sourceId
    && (screen.sources || []).some(source => (
      source.id === region.sourceId
      && source.typeId === typeId
      && source.mode === 'single'
    ))
  )) || regions.find(region => region.actions?.length) || null;
}

function screenHasSingleEntitySource(screen = {}, typeId = '') {
  return (screen.sources || []).some(source => (
    source.typeId === typeId && source.mode === 'single'
  ));
}
