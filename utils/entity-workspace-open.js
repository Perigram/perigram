import { useAuthStore } from '~/stores/auth';

const DETAIL_TEMPLATES = ['instanceDetail', 'entityDetail'];

/**
 * Opens an entity at its compiled destination. With the home workspace
 * shell deleted, the destination is the entity's compiled detail screen
 * (either manifest vocabulary — the projected `typeId` records or legacy
 * `entityType`); when the manifest has no detail surface for the type,
 * the app falls back to the home route. Callers (inline refs, chat
 * attachments, legacy collection rows) are unchanged.
 */
export function openEntityInWorkspace({ entityType = '', entityId = '' } = {}) {
  if (!entityType || !entityId || typeof window === 'undefined') return false;
  navigateTo(detailRouteForType(entityType, entityId) || homeRoute() || '/');
  return true;
}

function detailRouteForType(entityType, entityId) {
  const screens = useAuthStore().screenManifest || [];
  const detail = screens.find(screen => DETAIL_TEMPLATES.includes(screen.template)
    && hasEntitySource(screen, entityType, 'single'));
  if (detail) {
    return withEntityId(detail.route || screenRoute(detail), entityId);
  }
  const base = screens.find(screen => !DETAIL_TEMPLATES.includes(screen.template)
    && hasEntitySource(screen, entityType));
  return base
    ? withEntityId(screenRoute({ screenKey: `${base.screenKey || base.id}_detail` }), entityId)
    : null;
}

function hasEntitySource(screen = {}, entityType = '', mode = null) {
  return (screen.sources || []).some(source => (source.entityType || source.typeId) === entityType
    && (!mode || source.mode === mode));
}

function screenRoute(screen = {}) {
  return `/screens/${encodeURIComponent(screen.screenKey || screen.id)}`;
}

function withEntityId(route = '', entityId = '') {
  return `${route}?entityId=${encodeURIComponent(entityId)}`;
}

function homeRoute() {
  const home = (useAuthStore().screenManifest || []).find(screen => screen.template === 'home' && screen.route);
  return home?.route || null;
}
