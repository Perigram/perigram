import { createWorkspaceLeaf, workspaceLeaves } from './workspace-splits.js';

export const PROJECT_WORKSPACE_STATE_VERSION = 5;
export const PROJECT_WORKSPACE_LAYOUT_PRESET_LIMIT = 12;

export function projectWorkspaceStorageKey({ userId, organizationId, projectId }) {
  if (!userId || !organizationId || !projectId) return '';
  return ['cutkit', 'project-workspace', PROJECT_WORKSPACE_STATE_VERSION, userId, organizationId, projectId]
    .map(String)
    .join(':');
}

export function normalizeProjectWorkspaceState(value) {
  const paneTree = normalizePaneNode(value?.paneTree) || createWorkspaceLeaf('pane-1');
  const panes = workspaceLeaves(paneTree);
  const activePaneId = panes.some(pane => pane.id === value?.activePaneId)
    ? value.activePaneId
    : panes[0].id;
  const paneSequence = Math.max(
    Number.isInteger(value?.paneSequence) ? value.paneSequence : 1,
    ...panes.map(pane => Number.parseInt(pane.id.match(/^pane-(\d+)$/)?.[1] || '1', 10))
  );

  return {
    paneTree,
    activePaneId,
    paneSequence,
    explorerOpen: value?.explorerOpen !== false,
    explorerSize: normalizeExplorerSize(value?.explorerSize),
    openedEntityRefs: normalizeOpenedEntityRefs(value?.openedEntityRefs),
    openedPageRefs: normalizeOpenedPageRefs(value?.openedPageRefs),
    maximizedPaneId: panes.some(pane => pane.id === value?.maximizedPaneId)
      ? value.maximizedPaneId
      : '',
    recentlyClosedRefs: normalizeRecentlyClosedRefs(value?.recentlyClosedRefs),
    layoutPresets: normalizeWorkspaceLayoutPresets(value?.layoutPresets)
  };
}

export function workspaceLayoutPresetFromState(state, { id, name } = {}) {
  const normalized = normalizeProjectWorkspaceState(state);
  return normalizeWorkspaceLayoutPreset({
    id,
    name,
    paneTree: normalized.paneTree,
    activePaneId: normalized.activePaneId,
    paneSequence: normalized.paneSequence,
    explorerOpen: normalized.explorerOpen,
    explorerSize: normalized.explorerSize,
    maximizedPaneId: normalized.maximizedPaneId,
    openedEntityRefs: normalized.openedEntityRefs,
    openedPageRefs: normalized.openedPageRefs
  });
}

export function normalizeWorkspaceLayoutPreset(value) {
  const state = normalizeProjectWorkspaceState({
    paneTree: value?.paneTree,
    activePaneId: value?.activePaneId,
    paneSequence: value?.paneSequence,
    explorerOpen: value?.explorerOpen,
    explorerSize: value?.explorerSize,
    maximizedPaneId: value?.maximizedPaneId,
    openedEntityRefs: value?.openedEntityRefs,
    openedPageRefs: value?.openedPageRefs
  });
  const id = typeof value?.id === 'string' && value.id ? value.id : '';
  const name = typeof value?.name === 'string' ? value.name.trim().slice(0, 64) : '';
  if (!id || !name) return null;
  return {
    id,
    name,
    paneTree: state.paneTree,
    activePaneId: state.activePaneId,
    paneSequence: state.paneSequence,
    explorerOpen: state.explorerOpen,
    explorerSize: state.explorerSize,
    maximizedPaneId: state.maximizedPaneId,
    openedEntityRefs: state.openedEntityRefs,
    openedPageRefs: state.openedPageRefs
  };
}

export function loadProjectWorkspaceState(storage, key) {
  if (!storage || !key) return normalizeProjectWorkspaceState(null);
  try {
    return normalizeProjectWorkspaceState(JSON.parse(storage.getItem(key) || 'null'));
  } catch {
    return normalizeProjectWorkspaceState(null);
  }
}

export function saveProjectWorkspaceState(storage, key, state) {
  if (!storage || !key) return;
  try {
    storage.setItem(key, JSON.stringify({
      version: PROJECT_WORKSPACE_STATE_VERSION,
      ...normalizeProjectWorkspaceState(state)
    }));
  } catch {
    // Workspace persistence is a UI preference and must not block the editor.
  }
}

function normalizePaneNode(node, ids = new Set()) {
  if (!node || typeof node !== 'object' || typeof node.id !== 'string' || ids.has(node.id)) return null;
  ids.add(node.id);
  if (node.kind === 'leaf') {
    const selectionKey = typeof node.selectionKey === 'string' ? node.selectionKey : '';
    const tabKeys = normalizeTabKeys(node.tabKeys, selectionKey);
    return {
      kind: 'leaf',
      id: node.id,
      selectionKey: tabKeys.includes(selectionKey) ? selectionKey : (tabKeys[0] || ''),
      tabKeys
    };
  }
  if (node.kind !== 'split' || !['horizontal', 'vertical'].includes(node.orientation)) return null;
  if (!Array.isArray(node.children) || node.children.length !== 2) return null;
  const children = node.children.map(child => normalizePaneNode(child, ids));
  if (children.some(child => !child)) return null;
  return {
    kind: 'split',
    id: node.id,
    orientation: node.orientation,
    sizes: normalizeSplitSizes(node.sizes),
    children
  };
}

function normalizeTabKeys(value, selectionKey = '') {
  const keys = Array.isArray(value) ? value.filter(key => typeof key === 'string' && key) : [];
  if (selectionKey && !keys.includes(selectionKey)) keys.push(selectionKey);
  return [...new Set(keys)];
}

function normalizeSplitSizes(sizes) {
  if (!Array.isArray(sizes) || sizes.length !== 2) return [50, 50];
  const values = sizes.map(Number);
  if (values.some(size => !Number.isFinite(size) || size <= 0)) return [50, 50];
  const total = values[0] + values[1];
  return values.map(size => (size / total) * 100);
}

function normalizeExplorerSize(value) {
  const size = Number(value);
  return Number.isFinite(size) ? Math.min(40, Math.max(10, size)) : 15;
}

function normalizeOpenedPageRefs(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(reference => (
    reference
    && typeof reference.key === 'string'
    && typeof reference.pageId === 'string'
    && typeof reference.entityType === 'string'
    && typeof reference.entityId === 'string'
  )).map(reference => ({
    key: reference.key,
    pageId: reference.pageId,
    entityType: reference.entityType,
    entityId: reference.entityId
  }));
}

function normalizeOpenedEntityRefs(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(reference => (
    reference
    && typeof reference.key === 'string'
    && typeof reference.entityType === 'string'
    && typeof reference.entityId === 'string'
  )).map(reference => ({
    key: reference.key,
    entityType: reference.entityType,
    entityId: reference.entityId
  }));
}

function normalizeRecentlyClosedRefs(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(reference => (
    reference
    && typeof reference.key === 'string'
    && typeof reference.kind === 'string'
    && ['entity', 'page'].includes(reference.kind)
    && typeof reference.entityType === 'string'
    && typeof reference.entityId === 'string'
    && (reference.kind !== 'page' || typeof reference.pageId === 'string')
  )).slice(0, 20).map(reference => ({
    key: reference.key,
    kind: reference.kind,
    entityType: reference.entityType,
    entityId: reference.entityId,
    ...(reference.kind === 'page' ? { pageId: reference.pageId } : {})
  }));
}

function normalizeWorkspaceLayoutPresets(value) {
  if (!Array.isArray(value)) return [];
  const ids = new Set();
  return value.map(normalizeWorkspaceLayoutPreset).filter(preset => {
    if (!preset || ids.has(preset.id)) return false;
    ids.add(preset.id);
    return true;
  }).slice(0, PROJECT_WORKSPACE_LAYOUT_PRESET_LIMIT);
}
