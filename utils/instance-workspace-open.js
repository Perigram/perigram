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
 * and the app navigates home; the workspace consumes it on mount. An
 * `editor` flag (editor-protocol creates, SPEC §UI) asks the workspace to
 * open the type's editor page instead of the compiled detail tab.
 */
export function openInstanceInWorkspace({ typeId = '', instanceId = '', editor = false } = {}) {
  if (!typeId || !instanceId || typeof window === 'undefined') return false;
  const handled = !window.dispatchEvent(new CustomEvent(WORKSPACE_OPEN_EVENT, {
    detail: { typeId, instanceId, ...(editor ? { editor: true } : {}) },
    cancelable: true
  }));
  if (handled) return true;
  const pending = usePendingWorkspaceEntity();
  pending.value = { typeId, instanceId, ...(editor ? { editor: true } : {}) };
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
