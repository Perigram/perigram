import { generatedScreenRoute, normalizeScreenContract } from '~/packages/processes/src/screen-contract.js';

export function detailRouteForEntity({ entity = null, entityType = '', screenKey = '', manifest = [] } = {}) {
  const identifier = entityIdentifier(entity);
  if (!identifier || !entityType) return null;
  const screens = manifest.map(item => normalizeScreenContract(item));
  const pairedScreenKey = screenKey ? `${screenKey}_detail` : '';
  const pairedScreen = pairedScreenKey
    ? screens.find(item => isEntityDetailScreen(item, pairedScreenKey, entityType))
    : null;
  if (pairedScreen) {
    return entityRoute(pairedScreen.route || generatedScreenRoute(pairedScreenKey), entityType, identifier);
  }
  const screen = screens.find(item => item.template === 'entityDetail' && hasSingleEntitySource(item, entityType));
  if (screen) {
    return entityRoute(screen.route || generatedScreenRoute(screen.screenKey || screen.id), entityType, identifier);
  }
  const baseScreen = screens.find(item => item.template !== 'entityDetail' && hasEntitySource(item, entityType));
  if (!baseScreen) return null;
  return entityRoute(generatedScreenRoute(`${baseScreen.screenKey || baseScreen.id}_detail`), entityType, identifier);
}

export function entityIdentifier(entity) {
  return entity?._id || entity?.id || entity?.identity?.uid || '';
}

function isEntityDetailScreen(screen = {}, screenKey = '', entityType = '') {
  return screen.screenKey === screenKey && screen.template === 'entityDetail' && hasSingleEntitySource(screen, entityType);
}

// Screens arrive in either vocabulary: the CTS-projected manifest keys
// sources by `typeId`; legacy-adapter screens use `entityType`. Both name
// the same target and route resolution accepts either.
function hasEntitySource(screen = {}, entityType = '') {
  return (screen.sources || []).some(source => (source.entityType || source.typeId) === entityType);
}

function hasSingleEntitySource(screen = {}, entityType = '') {
  return (screen.sources || []).some(source => (source.entityType || source.typeId) === entityType && source.mode === 'single');
}

function entityRoute(path = '', entityType = '', identifier = '') {
  return {
    path,
    query: {
      entityId: identifier,
      [`${entityType}Id`]: identifier
    }
  };
}
