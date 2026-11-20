import { normalizeDockLayout } from './workspace-dock-layout.js';

// Per-editor dock layout. Editor surfaces identify themselves with a
// stable workspace id; the key stays scoped to the signed-in user and
// active organization; each user/org pair owns its layout.
export const DESIGNER_WORKSPACE_STATE_VERSION = 1;

export function designerWorkspaceStorageKey({ workspaceId, userId, organizationId }) {
  if (!workspaceId || !userId || !organizationId) return '';
  return ['perigram', 'designer-workspace', DESIGNER_WORKSPACE_STATE_VERSION, workspaceId, userId, organizationId]
    .map(String)
    .join(':');
}

export function loadDesignerWorkspaceState(storage, key) {
  if (!storage || !key) return { layout: null };
  try {
    return { layout: normalizeDockLayout(JSON.parse(storage.getItem(key) || 'null')?.layout) };
  } catch {
    return { layout: null };
  }
}

export function saveDesignerWorkspaceState(storage, key, state) {
  if (!storage || !key) return;
  try {
    storage.setItem(key, JSON.stringify({
      version: DESIGNER_WORKSPACE_STATE_VERSION,
      layout: normalizeDockLayout(state?.layout)
    }));
  } catch {
    // Editor layout is a UI preference: a write failure leaves the editor running.
  }
}
