import { createWorkspaceLeaf, ensureWorkspaceLeafTabs, workspaceLeaves } from './workspace-splits.js';

// Version 3: instance surfaces are instance-bound screen references.
export const HOME_WORKSPACE_STATE_VERSION = 3;

export function homeWorkspaceStorageKey({ userId, organizationId }) {
  if (!userId || !organizationId) return '';
  return ['perigram', 'home-workspace', HOME_WORKSPACE_STATE_VERSION, userId, organizationId]
    .map(String)
    .join(':');
}

export function loadHomeWorkspaceState(storage, key) {
  if (!storage || !key) return normalizeState(null);
  try {
    return normalizeState(JSON.parse(storage.getItem(key) || 'null'));
  } catch {
    return normalizeState(null);
  }
}

export function saveHomeWorkspaceState(storage, key, state) {
  if (!storage || !key) return;
  try {
    storage.setItem(key, JSON.stringify({
      version: HOME_WORKSPACE_STATE_VERSION,
      ...normalizeState(state)
    }));
  } catch {
    // Workspace persistence is a UI preference and must not block the shell.
  }
}

function normalizeState(value) {
  const paneTree = normalizePaneNode(value?.paneTree) || createWorkspaceLeaf('pane-1');
  const panes = workspaceLeaves(paneTree);
  return {
    paneTree: ensureWorkspaceLeafTabs(paneTree),
    activePaneId: panes.some(pane => pane.id === value?.activePaneId)
      ? value.activePaneId
      : panes[0].id,
    paneSequence: Math.max(
      Number.isInteger(value?.paneSequence) ? value.paneSequence : 1,
      ...panes.map(pane => Number.parseInt(pane.id.match(/^pane-(\d+)$/)?.[1] || '1', 10))
    ),
    openedEntityRefs: normalizeRefs(value?.openedEntityRefs, 'typeId', { requireInstanceId: true }),
    openedPageRefs: normalizeRefs(value?.openedPageRefs, 'pageId', { requireInstanceId: true }),
    openedScreenRefs: normalizeRefs(value?.openedScreenRefs, 'screenKey'),
    sidebarCollapsed: Boolean(value?.sidebarCollapsed)
  };
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

// The id key renamed with the instance vocabulary; stored refs from the
// entity-vocabulary era migrate one way at load (the next save persists
// the new shape).
function storedInstanceId(reference = {}) {
  if (typeof reference.instanceId === 'string') return reference.instanceId;
  if (typeof reference.entityId === 'string') return reference.entityId;
  return '';
}

function normalizeRefs(value, keyField, { requireInstanceId = false } = {}) {
  if (!Array.isArray(value)) return [];
  return value.filter(reference => (
    reference
    && typeof reference.key === 'string'
    && typeof reference[keyField] === 'string'
    && (!requireInstanceId || storedInstanceId(reference))
  )).map(reference => ({
    key: reference.key,
    [keyField]: reference[keyField],
    ...(keyField !== 'typeId' && typeof reference.typeId === 'string' ? { typeId: reference.typeId } : {}),
    ...(storedInstanceId(reference) ? { instanceId: storedInstanceId(reference) } : {})
  }));
}
