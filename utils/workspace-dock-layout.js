// Dockview layout state shared by the home workspace and designer shells:
// normalize a stored serialization, and prune panels whose surface fails
// to resolve before the layout reaches the live dock.

export function normalizeDockLayout(value) {
  if (!value || typeof value !== 'object') return null;
  if (!value.grid || typeof value.grid !== 'object') return null;
  if (!value.panels || typeof value.panels !== 'object' || Array.isArray(value.panels)) return null;
  let layout;
  try {
    layout = JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
  if (!pruneNodeShape(layout.grid?.root)) return null;
  // DockviewVue serializes its defaultTab slot reference as a component
  // name; the dock resolves every tab through that slot on restore.
  for (const state of Object.values(layout.panels)) {
    if (state && typeof state === 'object') delete state.tabComponent;
  }
  return {
    grid: layout.grid,
    panels: layout.panels,
    ...(typeof layout.activeGroup === 'string' ? { activeGroup: layout.activeGroup } : {}),
    ...(Array.isArray(layout.floatingGroups) ? { floatingGroups: layout.floatingGroups } : {})
  };
}

export function pruneDockLayout(layout, isResolvable) {
  const normalized = normalizeDockLayout(layout);
  if (!normalized || typeof isResolvable !== 'function') return normalized;
  const panels = {};
  for (const [id, state] of Object.entries(normalized.panels)) {
    if (isResolvable(id)) panels[id] = state;
  }
  const root = pruneNode(normalized.grid?.root, panels, true);
  if (!root) return null;
  const gridRoot = root.type === 'branch'
    ? root
    : { type: 'branch', data: [root], size: root.size || 100 };
  const groupIds = new Set();
  collectGroupIds(gridRoot, groupIds);
  const floatingGroups = (normalized.floatingGroups || [])
    .map(group => pruneFloatingGroup(group, panels))
    .filter(Boolean);
  return {
    ...normalized,
    grid: { ...normalized.grid, root: gridRoot },
    panels,
    activeGroup: groupIds.has(normalized.activeGroup) ? normalized.activeGroup : [...groupIds][0],
    ...(floatingGroups.length ? { floatingGroups } : {})
  };
}

// A floating window is dropped when any of its panels fails to resolve;
// single-group windows keep their surviving views.
function pruneFloatingGroup(group, panels) {
  if (!group || typeof group !== 'object' || !group.position || typeof group.position !== 'object') return null;
  if (group.data) {
    const views = (group.data.views || []).filter(id => panels[id]);
    if (!views.length) return null;
    return {
      ...group,
      data: {
        ...group.data,
        views,
        activeView: views.includes(group.data.activeView) ? group.data.activeView : views[0]
      }
    };
  }
  if (!group.grid?.root) return null;
  const ids = [];
  collectLeafViews(group.grid.root, ids);
  return ids.every(id => panels[id]) ? group : null;
}

export function dockLayoutPanelIds(layout) {
  const normalized = normalizeDockLayout(layout);
  if (!normalized) return [];
  return Object.keys(normalized.panels);
}

function pruneNodeShape(node) {
  if (!node || typeof node !== 'object') return false;
  if (node.type === 'leaf') {
    return Boolean(node.data && typeof node.data.id === 'string' && Array.isArray(node.data.views));
  }
  if (node.type !== 'branch' || !Array.isArray(node.data) || !node.data.length) return false;
  return node.data.every(pruneNodeShape);
}

function pruneNode(node, panels, isRoot = false) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'leaf') {
    if (!node.data || typeof node.data.id !== 'string') return null;
    const views = (node.data.views || []).filter(id => panels[id]);
    if (!views.length) return null;
    return {
      ...node,
      data: {
        ...node.data,
        views,
        activeView: views.includes(node.data.activeView) ? node.data.activeView : views[0]
      }
    };
  }
  if (node.type !== 'branch') return null;
  const children = (node.data || []).map(child => pruneNode(child, panels)).filter(Boolean);
  if (!children.length) return null;
  if (children.length === 1 && !isRoot) return children[0];
  return { ...node, data: children };
}

function collectGroupIds(node, ids) {
  if (!node) return;
  if (node.type === 'leaf') {
    if (node.data?.id) ids.add(node.data.id);
    return;
  }
  for (const child of node.data || []) collectGroupIds(child, ids);
}

function collectLeafViews(node, ids) {
  if (!node) return;
  if (node.type === 'leaf') {
    ids.push(...(node.data?.views || []));
    return;
  }
  for (const child of node.data || []) collectLeafViews(child, ids);
}
