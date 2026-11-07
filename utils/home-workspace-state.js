import { ensureWorkspaceLeafTabs } from './workspace-splits.js';
import { normalizeProjectWorkspaceState } from './project-workspace-state.js';

// Version 3: instance surfaces are compiled screen tabs (instance-bound
// screen refs); the entity tab-key contract is gone from the home shell.
export const HOME_WORKSPACE_STATE_VERSION = 3;

export function homeWorkspaceStorageKey({ userId, organizationId }) {
  if (!userId || !organizationId) return '';
  return ['perigram', 'home-workspace', HOME_WORKSPACE_STATE_VERSION, userId, organizationId]
    .map(String)
    .join(':');
}

export function loadHomeWorkspaceState(storage, key) {
  if (!storage || !key) return paneState(null);
  try {
    return paneState(JSON.parse(storage.getItem(key) || 'null'));
  } catch {
    return paneState(null);
  }
}

export function saveHomeWorkspaceState(storage, key, state) {
  if (!storage || !key) return;
  try {
    storage.setItem(key, JSON.stringify({
      version: HOME_WORKSPACE_STATE_VERSION,
      ...paneState(state)
    }));
  } catch {
    // Workspace persistence is a UI preference and must not block the shell.
  }
}

// The pane tree, tab references, and page references share the project
// workspace normalization contract; explorer fields are not part of the
// home shell and are dropped here. Home panes additionally never exist
// without a tab, so tabless leaves normalize to a default empty tab.
// `sidebarCollapsed` and `collapsedSectionKeys` are v3-compatible
// additions: stored states without them default to the expanded sidebar
// and no collapsed sections.
function paneState(value) {
  const state = normalizeProjectWorkspaceState(value);
  return {
    paneTree: ensureWorkspaceLeafTabs(state.paneTree),
    activePaneId: state.activePaneId,
    paneSequence: state.paneSequence,
    openedEntityRefs: state.openedEntityRefs,
    openedPageRefs: state.openedPageRefs,
    openedScreenRefs: state.openedScreenRefs,
    sidebarCollapsed: Boolean(value?.sidebarCollapsed),
    collapsedSectionKeys: Array.isArray(value?.collapsedSectionKeys) ? value.collapsedSectionKeys : []
  };
}
