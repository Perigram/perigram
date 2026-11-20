import { normalizeDockLayout } from './workspace-dock-layout.js';

// Version 4: the pane/tab layout is a dockview serialization. Version 3
// pane trees are read once and flattened into open tabs on first load.
export const HOME_WORKSPACE_STATE_VERSION = 4;

export function homeWorkspaceStorageKey({ userId, organizationId }) {
  if (!userId || !organizationId) return '';
  return ['perigram', 'home-workspace', HOME_WORKSPACE_STATE_VERSION, userId, organizationId]
    .map(String)
    .join(':');
}

export function loadHomeWorkspaceState(storage, key) {
  if (!storage || !key) return emptyState();
  const current = readState(storage, key);
  if (current) return normalizeHomeState(current);
  const legacy = readState(storage, legacyStorageKey(key));
  if (legacy) return normalizeLegacyHomeState(legacy);
  return emptyState();
}

export function saveHomeWorkspaceState(storage, key, state) {
  if (!storage || !key) return;
  try {
    storage.setItem(key, JSON.stringify({
      version: HOME_WORKSPACE_STATE_VERSION,
      layout: normalizeDockLayout(state?.layout),
      openedEntityRefs: normalizeOpenedEntityRefs(state?.openedEntityRefs),
      openedPageRefs: normalizeOpenedPageRefs(state?.openedPageRefs),
      openedScreenRefs: normalizeOpenedScreenRefs(state?.openedScreenRefs),
      openedCustomPageRefs: normalizeOpenedCustomPageRefs(state?.openedCustomPageRefs),
      openedChatRefs: normalizeOpenedChatRefs(state?.openedChatRefs),
      sidebarCollapsed: Boolean(state?.sidebarCollapsed),
      collapsedSectionKeys: normalizeStringList(state?.collapsedSectionKeys)
    }));
  } catch {
    // Workspace persistence is a UI preference: a write failure leaves the shell running.
  }
}

function emptyState() {
  return {
    layout: null,
    pendingTabKeys: [],
    pendingActiveKey: '',
    openedEntityRefs: [],
    openedPageRefs: [],
    openedScreenRefs: [],
    openedCustomPageRefs: [],
    openedChatRefs: [],
    sidebarCollapsed: false,
    collapsedSectionKeys: []
  };
}

function readState(storage, key) {
  if (!key) return null;
  try {
    return JSON.parse(storage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

function normalizeHomeState(value) {
  return {
    layout: normalizeDockLayout(value?.layout),
    pendingTabKeys: [],
    pendingActiveKey: '',
    openedEntityRefs: normalizeOpenedEntityRefs(value?.openedEntityRefs),
    openedPageRefs: normalizeOpenedPageRefs(value?.openedPageRefs),
    openedScreenRefs: normalizeOpenedScreenRefs(value?.openedScreenRefs),
    openedCustomPageRefs: normalizeOpenedCustomPageRefs(value?.openedCustomPageRefs),
    openedChatRefs: normalizeOpenedChatRefs(value?.openedChatRefs),
    sidebarCollapsed: Boolean(value?.sidebarCollapsed),
    collapsedSectionKeys: normalizeStringList(value?.collapsedSectionKeys)
  };
}

function normalizeLegacyHomeState(value) {
  const tabKeys = legacyTabKeys(value?.paneTree);
  const customPages = tabKeys
    .filter(key => key.startsWith('page:customPage:'))
    .map(key => ({ key, docId: key.slice('page:customPage:'.length) }))
    .filter(reference => reference.docId);
  const chats = tabKeys
    .filter(key => key.startsWith('page:chat:'))
    .map(key => ({ key, conversationKey: key.slice('page:chat:'.length), label: '' }))
    .filter(reference => reference.conversationKey);
  return {
    ...emptyState(),
    pendingTabKeys: tabKeys,
    pendingActiveKey: legacyActiveKey(value?.paneTree, value?.activePaneId),
    openedEntityRefs: normalizeOpenedEntityRefs(value?.openedEntityRefs),
    openedPageRefs: normalizeOpenedPageRefs(value?.openedPageRefs),
    openedScreenRefs: normalizeOpenedScreenRefs(value?.openedScreenRefs),
    openedCustomPageRefs: customPages,
    openedChatRefs: chats,
    sidebarCollapsed: Boolean(value?.sidebarCollapsed),
    collapsedSectionKeys: normalizeStringList(value?.collapsedSectionKeys)
  };
}

function legacyStorageKey(key = '') {
  const parts = String(key).split(':');
  if (parts[2] !== String(HOME_WORKSPACE_STATE_VERSION)) return '';
  parts[2] = '3';
  return parts.join(':');
}

function legacyTabKeys(node, keys = []) {
  if (!node || typeof node !== 'object') return keys;
  if (node.kind === 'leaf') {
    for (const key of node.tabKeys || []) {
      if (typeof key === 'string' && key && !keys.includes(key)) keys.push(key);
    }
    return keys;
  }
  for (const child of node.children || []) legacyTabKeys(child, keys);
  return keys;
}

function legacyActiveKey(node, activePaneId = '') {
  if (!node || typeof node !== 'object') return '';
  if (node.kind === 'leaf') {
    return node.id === activePaneId && typeof node.selectionKey === 'string' ? node.selectionKey : '';
  }
  for (const child of node.children || []) {
    const key = legacyActiveKey(child, activePaneId);
    if (key) return key;
  }
  return '';
}

function normalizeStringList(value) {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string' && item) : [];
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
    ...(typeof reference.typeId === 'string' ? { typeId: reference.typeId } : {}),
    ...(typeof reference.instanceId === 'string' ? { instanceId: reference.instanceId } : {})
  }));
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

function normalizeOpenedCustomPageRefs(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(reference => (
    reference
    && typeof reference.key === 'string'
    && typeof reference.docId === 'string'
    && reference.docId
  )).map(reference => ({ key: reference.key, docId: reference.docId }));
}

function normalizeOpenedChatRefs(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(reference => (
    reference
    && typeof reference.key === 'string'
    && typeof reference.conversationKey === 'string'
    && reference.conversationKey
  )).map(reference => ({
    key: reference.key,
    conversationKey: reference.conversationKey,
    label: typeof reference.label === 'string' ? reference.label : ''
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

// The id key renamed with the instance vocabulary; stored refs from the
// entity-vocabulary era migrate one way at load.
function storedInstanceId(reference = {}) {
  if (typeof reference.instanceId === 'string') return reference.instanceId;
  if (typeof reference.entityId === 'string') return reference.entityId;
  return '';
}
