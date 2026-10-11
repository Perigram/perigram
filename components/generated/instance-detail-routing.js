import { generatedScreenRoute } from '~/packages/processes/src/screen-contract.js';

export function detailRouteForInstance({ entity = null, typeId = '', screenKey = '', manifest = [] } = {}) {
  const identifier = instanceIdentifier(entity);
  if (!identifier || !typeId) return null;
  const screens = manifest || [];
  const pairedScreenKey = screenKey ? `${screenKey}_detail` : '';
  const pairedScreen = pairedScreenKey
    ? screens.find(item => isEntityDetailScreen(item, pairedScreenKey, typeId))
    : null;
  if (pairedScreen) {
    return entityRoute(pairedScreen.route || generatedScreenRoute(pairedScreenKey), typeId, identifier);
  }
  const screen = screens.find(item => item.template === 'instanceDetail' && hasSingleEntitySource(item, typeId));
  if (screen) {
    return entityRoute(screen.route || generatedScreenRoute(screen.screenKey || screen.id), typeId, identifier);
  }
  const baseScreen = screens.find(item => item.template !== 'instanceDetail' && hasEntitySource(item, typeId));
  if (!baseScreen) return null;
  return entityRoute(generatedScreenRoute(`${baseScreen.screenKey || baseScreen.id}_detail`), typeId, identifier);
}

export function instanceIdentifier(entity) {
  return entity?._id || entity?.id || '';
}

function isEntityDetailScreen(screen = {}, screenKey = '', typeId = '') {
  return screen.screenKey === screenKey && screen.template === 'instanceDetail' && hasSingleEntitySource(screen, typeId);
}

// The manifest speaks the projected vocabulary: sources key their target
// by `typeId`.
function hasEntitySource(screen = {}, typeId = '') {
  return (screen.sources || []).some(source => source.typeId === typeId);
}

function hasSingleEntitySource(screen = {}, typeId = '') {
  return (screen.sources || []).some(source => source.typeId === typeId && source.mode === 'single');
}

function entityRoute(path = '', typeId = '', identifier = '') {
  return {
    path,
    query: {
      instanceId: identifier,
      [`${typeId}Id`]: identifier
    }
  };
}
