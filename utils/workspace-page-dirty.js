// Dirty registry for workspace page tabs: the pane-close guard consults
// it before closing a tab whose hosted page holds unsaved edits.
const dirtyPages = new Set();

export function setWorkspacePageDirty(key, dirty) {
  if (!key) return;
  if (dirty) dirtyPages.add(key);
  else dirtyPages.delete(key);
}

export function isWorkspacePageDirty(key) {
  return Boolean(key && dirtyPages.has(key));
}
