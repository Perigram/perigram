export function generatedDetailScreenForEntityType({
  screens = [],
  entityType = '',
  preferredRoute = ''
} = {}) {
  const candidates = (Array.isArray(screens) ? screens : []).filter(screen => (
    screen?.template === 'entityDetail'
    && screenHasSingleEntitySource(screen, entityType)
  ));
  if (!candidates.length) return null;
  return candidates.find(screen => screen.route === preferredRoute) || candidates[0];
}

export function generatedDetailActionIds({
  screens = [],
  entityType = '',
  preferredRoute = ''
} = {}) {
  const screen = generatedDetailScreenForEntityType({ screens, entityType, preferredRoute });
  if (!screen) return [];
  const mainRegion = detailMainRegion(screen, entityType);
  const actionIds = mainRegion?.actions?.length ? mainRegion.actions : screen.actions;
  return Array.isArray(actionIds) ? actionIds : [];
}

function detailMainRegion(screen = {}, entityType = '') {
  const regions = Array.isArray(screen.regions) ? screen.regions : [];
  return regions.find(region => (
    region?.sourceId
    && (screen.sources || []).some(source => (
      source.id === region.sourceId
      && source.entityType === entityType
      && source.mode === 'single'
    ))
  )) || regions.find(region => region.actions?.length) || null;
}

function screenHasSingleEntitySource(screen = {}, entityType = '') {
  return (screen.sources || []).some(source => (
    source.entityType === entityType && source.mode === 'single'
  ));
}
