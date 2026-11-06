import { useAuthStore } from '~/stores/auth';

const WORKSPACE_OPEN_EVENT = 'perigram:open-workspace-entity';

const usePendingWorkspaceEntity = () => useState('pendingWorkspaceEntity', () => null);

function homeWorkspaceRoute() {
  const authStore = useAuthStore();
  const home = (authStore.screenManifest || []).find(screen => screen.template === 'home' && screen.route);
  return home?.route || null;
}

/**
 * Opens an entity as a tab of the home workspace — the desktop "everything
 * lives inside the home framework" rule. Fast path: a mounted home workspace
 * (the chats drawer/popups float above it) consumes the event and opens the
 * pane tab immediately. Otherwise the request is stashed as pending state
 * and the app navigates home; the workspace consumes it on mount.
 */
export function openInstanceInWorkspace({ typeId = '', instanceId = '' } = {}) {
  if (!typeId || !instanceId || typeof window === 'undefined') return false;
  const handled = !window.dispatchEvent(new CustomEvent(WORKSPACE_OPEN_EVENT, {
    detail: { typeId, instanceId },
    cancelable: true
  }));
  if (handled) return true;
  const pending = usePendingWorkspaceEntity();
  pending.value = { typeId, instanceId };
  navigateTo(homeWorkspaceRoute() || '/');
  return true;
}

export function consumePendingWorkspaceInstance() {
  const pending = usePendingWorkspaceEntity();
  const request = pending.value;
  pending.value = null;
  return request;
}

export const workspaceInstanceOpenEvent = WORKSPACE_OPEN_EVENT;
