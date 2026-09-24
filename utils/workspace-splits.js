import { emptyTabKey, isEmptyTabKey } from './workspace-empty-tabs.js';

export function createWorkspaceLeaf(id, selectionKey = '') {
  return { kind: 'leaf', id, selectionKey, tabKeys: selectionKey ? [selectionKey] : [] };
}

export function splitWorkspaceLeaf(root, targetId, orientation, nextLeaf) {
  if (!root || !nextLeaf || !['horizontal', 'vertical'].includes(orientation)) return root;
  if (root.kind === 'leaf') {
    if (root.id !== targetId) return root;
    return {
      kind: 'split',
      id: `split:${root.id}:${nextLeaf.id}`,
      orientation,
      sizes: [50, 50],
      children: [root, nextLeaf]
    };
  }
  return {
    ...root,
    children: root.children.map(child => splitWorkspaceLeaf(child, targetId, orientation, nextLeaf))
  };
}

export function updateWorkspaceLeaf(root, targetId, patch = {}) {
  if (!root) return root;
  if (root.kind === 'leaf') return root.id === targetId ? { ...root, ...patch } : root;
  return {
    ...root,
    children: root.children.map(child => updateWorkspaceLeaf(child, targetId, patch))
  };
}

export function updateWorkspaceSplit(root, targetId, sizes) {
  if (!root || !Array.isArray(sizes) || sizes.length !== 2) return root;
  if (root.kind === 'leaf') return root;
  if (root.id === targetId) return { ...root, sizes: normalizeSplitSizes(sizes) };
  return {
    ...root,
    children: root.children.map(child => updateWorkspaceSplit(child, targetId, sizes))
  };
}

export function closeWorkspaceLeaf(root, targetId) {
  if (!root || root.kind === 'leaf') return root;
  const remaining = root.children.filter(child => !(child.kind === 'leaf' && child.id === targetId));
  if (remaining.length === 1) return remaining[0];
  if (remaining.length !== root.children.length) return { ...root, children: remaining };

  const children = root.children.map(child => closeWorkspaceLeaf(child, targetId));
  return children.length === 1 ? children[0] : { ...root, children };
}

export function workspaceLeaves(root) {
  if (!root) return [];
  if (root.kind === 'leaf') return [root];
  return root.children.flatMap(workspaceLeaves);
}

// Panes never exist without a tab: any tabless leaf — trees built without
// a selection or persisted states that predate the default — resolves to
// one default empty tab.
export function ensureWorkspaceLeafTabs(root) {
  if (!root) return root;
  if (root.kind === 'leaf') {
    return (root.tabKeys || []).length ? root : createWorkspaceLeaf(root.id, emptyTabKey());
  }
  return { ...root, children: root.children.map(ensureWorkspaceLeafTabs) };
}

// Tab creation is explicit: only callers that pass `newTab` (the tab strip's
// add control opening an empty placeholder, live call stages that must not
// unmount) append a tab. Every other open reuses the pane's selected tab in
// place — replacing empty placeholders like any content — so exploring does
// not pile up one tab per entity. Opening an item that already has a tab in
// the pane keeps the tabs unchanged (selection happens at the caller).
export function withPaneTab(pane, key, { newTab = false } = {}) {
  const tabs = pane.tabKeys || [];
  if (newTab || isEmptyTabKey(key) || tabs.includes(key) || !tabs.length) {
    return [...new Set([...tabs, key])];
  }
  const replacing = tabs.includes(pane.selectionKey) ? pane.selectionKey : tabs[tabs.length - 1];
  return tabs.map(tabKey => (tabKey === replacing ? key : tabKey));
}

function normalizeSplitSizes(sizes) {
  const normalized = sizes.map(size => Number(size));
  if (normalized.some(size => !Number.isFinite(size) || size <= 0)) return [50, 50];
  const total = normalized[0] + normalized[1];
  return normalized.map(size => (size / total) * 100);
}
