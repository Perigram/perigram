import { createWorkspaceLeaf, workspaceLeaves } from './workspace-splits.js';

export const PROJECT_WORKSPACE_STATE_VERSION = 4;

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
    openedScreenRefs: normalizeOpenedScreenRefs(value?.openedScreenRefs)
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

function normalizeOpenedScreenRefs(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(reference => (
    reference
    && typeof reference.key === 'string'
    && typeof reference.screenKey === 'string'
  )).map(reference => ({
    key: reference.key,
    screenKey: reference.screenKey,
    ...(typeof reference.typeId === 'string' ? { typeId: reference.typeId } : {})
  }));
}

// The id key renamed with the instance vocabulary; stored refs from the
// entity-vocabulary era migrate one way at load (the next save persists
// the new shape).
function storedInstanceId(reference = {}) {
  if (typeof reference.instanceId === 'string') return reference.instanceId;
  if (typeof reference.entityId === 'string') return reference.entityId;
  return '';
}

function normalizeOpenedPageRefs(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(reference => (
    reference
    && typeof reference.key === 'string'
    && typeof reference.pageId === 'string'
    && typeof reference.typeId === 'string'
    && storedInstanceId(reference)
  )).map(reference => ({
    key: reference.key,
    pageId: reference.pageId,
    typeId: reference.typeId,
    instanceId: storedInstanceId(reference)
  }));
}

function normalizeOpenedEntityRefs(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(reference => (
    reference
    && typeof reference.key === 'string'
    && typeof reference.typeId === 'string'
    && storedInstanceId(reference)
  )).map(reference => ({
    key: reference.key,
    typeId: reference.typeId,
    instanceId: storedInstanceId(reference)
  }));
}
