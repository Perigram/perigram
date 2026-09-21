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
