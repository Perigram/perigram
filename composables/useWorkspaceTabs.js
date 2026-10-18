import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '~/stores/auth';
import { useInstancesStore } from '~/stores/instances';
import { useRegistryStore } from '~/stores/registry';
import { localizedLabel, titleFor, typeLabelKey } from '#shared/ui-mapping/index.js';
import { dtoToScreenInstance } from '~/utils/instance-shape.js';
import { emptyTabKey, isEmptyTabKey } from '~/utils/workspace-empty-tabs.js';
import {
  closeWorkspaceLeaf,
  createWorkspaceLeaf,
  pruneLeafTabs,
  splitWorkspaceLeaf,
  updateWorkspaceLeaf,
  updateWorkspaceSplit,
  withPaneTab,
  workspaceLeaves
} from '~/utils/workspace-splits.js';
import {
  chatTabKey,
  entityPoolKey,
  pageInstanceTabKey,
  pageTabKey,
  screenInstanceTabKey,
  screenTabKey
} from '~/utils/workspace-tab-keys.js';
import { loadHomeWorkspaceState, saveHomeWorkspaceState } from '~/utils/home-workspace-state.js';
import { generatedWorkspacePages, entityWorkspacePageIdFor, resolveGeneratedWorkspacePage } from '~/components/generated/workspace-pages.js';
import { resolveFileSurface } from '~/components/generated/file-surfaces.js';
import { resolveDetailScreen } from '~/components/generated/detail-screen-actions.js';

const PANE_HISTORY_LIMIT = 50;

// The pane tab lifecycle owner: pane tree, tab selections, navigation
// history, open-content reference pools, and their persisted state (see
// components/generated/README.md). The host supplies the manifest-derived
// section items (home sections) and the storage key scope; everything a
// tab can hold is registered here — screen refs, page refs (entity-bound
// and blank), entity pool payloads, session entities (explorer children),
// call stages, and pinned conversations.
export function useWorkspaceTabs({ storageKey, sectionItems, sidebarCollapsed }) {
  const authStore = useAuthStore();
  const instances = useInstancesStore();
  const registryStore = useRegistryStore();
  const { te, t } = useI18n();

  const paneTree = ref(createWorkspaceLeaf('pane-1', emptyTabKey()));
  const activePaneId = ref('pane-1');
  const paneSequence = ref(1);
  const paneHistories = ref(new Map());
  const hydratedStorageKey = ref('');
  let isMounted = false;

  const openedScreenRefs = ref([]);
  const openedPageRefs = ref([]);
  const openedEntityRefs = ref([]);
  const entityPayloads = ref([]);
  const sessionEntityItems = ref([]);
  const callPageRefs = ref([]);
  const chatPageRefs = ref([]);
  const pageParamsByKey = ref({});
  let entityLoadSequence = 0;

  function defaultLeaf(id) {
    return createWorkspaceLeaf(id, emptyTabKey());
  }

  const panes = computed(() => workspaceLeaves(paneTree.value));
  const paneCount = computed(() => panes.value.length);
  const activePane = computed(() => panes.value.find(pane => pane.id === activePaneId.value) || panes.value[0]);

  function typeLabelOf(typeId = '') {
    const record = registryStore.typeRecord(typeId);
    if (!record) return typeId;
    return localizedLabel({ te, t }, typeLabelKey(typeId), record.name || '');
  }

  // Instance labels resolve live from the instances pool (the screen hosts
  // load the same pool); a not-yet-loaded record falls back to its type
  // label until hydration lands.
  function instanceLabelOf(typeId = '', id = '') {
    const typeRecord = registryStore.typeRecord(typeId);
    const entity = instances.records?.[instances.canonicalTypeKey(typeId)]?.[String(id)];
    if (typeRecord && entity) {
      return titleFor(dtoToScreenInstance(entity.dto, typeRecord), typeRecord, { unnamedLabel: t('common.unnamed') });
    }
    return typeLabelOf(typeId || id) || '';
  }

  function screenLabelFor(screenKey = '') {
    const screen = (authStore.screenManifest || []).find(candidate => (
      candidate.screenKey === screenKey || candidate.id === screenKey
    ));
    return localizedLabel({ te, t }, screen?.typeId ? typeLabelKey(screen.typeId) : '', screen?.label || screen?.typeId || screenKey);
  }

  function workspacePageLabel(pageId = '') {
    const page = resolveGeneratedWorkspacePage(pageId);
    return localizedLabel({ te, t }, page?.labelKey || '', pageId);
  }

  function makeEntityItem(typeId, entity) {
    return { key: entityPoolKey(typeId, instanceIdOf(entity)), kind: 'instance', type: typeId, entity };
  }

  // Reference entities resolve immediately — the payload when hydrated,
  // an id stub until then — so a restored tab always renders as its kind
  // and never as a placeholder.
  const refEntityItems = computed(() => openedEntityRefs.value.map(reference => {
    const payload = entityPayloads.value.find(item => item.key === reference.key);
    return makeEntityItem(reference.typeId, payload?.entity || { _id: reference.instanceId });
  }));

  const workspaceEntityItems = computed(() => [
    ...sectionItems.value,
    ...refEntityItems.value,
    ...sessionEntityItems.value
  ].filter((item, index, items) => items.findIndex(candidate => candidate.key === item.key) === index));

  const screenItems = computed(() => openedScreenRefs.value.map(reference => {
    const base = {
      key: reference.key,
      kind: 'screen',
      screenKey: reference.screenKey,
      typeId: reference.typeId || '',
      instanceId: reference.instanceId || '',
      icon: registryStore.iconFor(reference.typeId)
    };
    return reference.instanceId
      ? { ...base, label: instanceLabelOf(reference.typeId, reference.instanceId) }
      : { ...base, label: screenLabelFor(reference.screenKey) };
  }));

  const openedPageItems = computed(() => openedPageRefs.value.map(reference => {
    // Blank editor pages (SPEC §UI): a singleton entity-less tab — the
    // editor's first save creates the record.
    if (!reference.instanceId) {
      return {
        key: reference.key,
        kind: 'page',
        pageId: reference.pageId,
        entity: null,
        typeId: reference.typeId || '',
        label: workspacePageLabel(reference.pageId),
        icon: resolveGeneratedWorkspacePage(reference.pageId)?.icon
      };
    }
    const entityItem = workspaceEntityItems.value.find(item => (
      item.type === reference.typeId
      && instanceIdOf(item.entity) === reference.instanceId
    ));
    return {
      key: reference.key,
      kind: 'page',
      pageId: reference.pageId,
      entity: entityItem?.entity || { _id: reference.instanceId },
      typeId: reference.typeId,
      label: instanceLabelOf(reference.typeId, reference.instanceId),
      icon: resolveGeneratedWorkspacePage(reference.pageId)?.icon
    };
  }));

  const staticPageItems = computed(() => generatedWorkspacePages()
    .filter(page => !page.typeId && !page.ephemeral)
    .map(page => ({
      key: pageTabKey(page.id),
      kind: 'page',
      pageId: page.id,
      params: pageParamsByKey.value[pageTabKey(page.id)] || null,
      label: workspacePageLabel(page.id),
      icon: page.icon
    })));

  const callPageItems = computed(() => callPageRefs.value.map(call => ({
    key: call.key,
    kind: 'page',
    pageId: 'call',
    room: call.room,
    conversationKey: call.conversationKey,
    label: call.label || workspacePageLabel('call'),
    icon: resolveGeneratedWorkspacePage('call')?.icon
  })));

  const chatPageItems = computed(() => chatPageRefs.value.map(chat => ({
    key: chat.key,
    kind: 'page',
    pageId: 'chats',
    conversationKey: chat.conversationKey,
    label: chat.label || workspacePageLabel('chats'),
    icon: resolveGeneratedWorkspacePage('chats')?.icon
  })));

  const workspaceItems = computed(() => [
    ...workspaceEntityItems.value,
    ...screenItems.value,
    ...openedPageItems.value,
    ...callPageItems.value,
    ...chatPageItems.value,
    ...staticPageItems.value
  ].filter((item, index, items) => items.findIndex(candidate => candidate.key === item.key) === index));

  // Tabs whose content died close themselves: a dropped reference (dead
  // type, unreadable record) takes its tab with it instead of leaving a
  // placeholder ghost.
  watch([paneTree, workspaceItems], () => {
    const resolvable = new Set(workspaceItems.value.map(item => item.key));
    const pruned = pruneLeafTabs(paneTree.value, resolvable, isEmptyTabKey);
    if (pruned !== paneTree.value) paneTree.value = pruned;
  });

  function activatePane(paneId) {
    activePaneId.value = paneId;
  }

  // An in-place replacement (new content taking over the selected tab) is a
  // navigation step: remember where the user came from unless this
  // selection IS the back step.
  function selectPaneTab(paneId, key, options = {}) {
    const pane = panes.value.find(item => item.id === paneId);
    if (!pane) return;
    if (!isEmptyTabKey(key) && !workspaceItems.value.some(item => item.key === key)) return;
    if (!options.back && isReplacingSelection(pane, key, options)) {
      pushPaneHistory(paneId, pane.selectionKey);
    }
    paneTree.value = updateWorkspaceLeaf(paneTree.value, paneId, {
      selectionKey: key,
      tabKeys: withPaneTab(pane, key, options)
    });
    activePaneId.value = paneId;
  }

  function isReplacingSelection(pane, key, options = {}) {
    const tabs = pane.tabKeys || [];
    return !options.newTab
      && !isEmptyTabKey(key)
      && !isEmptyTabKey(pane.selectionKey)
      && key !== pane.selectionKey
      && !tabs.includes(key);
  }

  function pushPaneHistory(paneId, key) {
    if (!key) return;
    const stack = paneHistories.value.get(paneId) || [];
    paneHistories.value = new Map([...paneHistories.value, [
      paneId,
      [...stack, key].slice(-PANE_HISTORY_LIMIT)
    ]]);
  }

  function paneHasHistory(paneId) {
    return (paneHistories.value.get(paneId) || []).length > 0;
  }

  // Back walks the stack to the last entry whose content still resolves.
  function goBackFromPane(paneId) {
    const pane = panes.value.find(item => item.id === paneId);
    if (!pane) return;
    const stack = [...(paneHistories.value.get(paneId) || [])];
    while (stack.length) {
      const key = stack.pop();
      paneHistories.value = new Map([...paneHistories.value, [paneId, stack]]);
      if (workspaceItems.value.some(item => item.key === key)) {
        selectPaneTab(paneId, key, { back: true });
        return;
      }
    }
    paneHistories.value = new Map([...paneHistories.value, [paneId, []]]);
  }

  function openEmptyPaneTab(paneId) {
    selectPaneTab(paneId, emptyTabKey());
  }

  function closePaneTab(paneId, key) {
    const pane = panes.value.find(item => item.id === paneId);
    if (!pane) return;
    const currentKeys = pane.tabKeys || [];
    const closingIndex = currentKeys.indexOf(key);
    if (closingIndex < 0) return;
    const tabKeys = currentKeys.filter(tabKey => tabKey !== key);

    // Closing the last tab closes the pane, except the workspace's last
    // pane, which resets to a fresh empty tab.
    if (!tabKeys.length) {
      if (paneCount.value <= 1) {
        const freshKey = emptyTabKey();
        paneTree.value = updateWorkspaceLeaf(paneTree.value, paneId, { selectionKey: freshKey, tabKeys: [freshKey] });
        forgetClosedTabRefs(key);
        activePaneId.value = paneId;
        return;
      }
      closePane(paneId);
      forgetClosedTabRefs(key);
      return;
    }

    const selectionKey = pane.selectionKey === key
      ? (tabKeys[Math.max(0, closingIndex - 1)] || '')
      : pane.selectionKey;
    paneTree.value = updateWorkspaceLeaf(paneTree.value, paneId, { selectionKey, tabKeys });
    forgetClosedTabRefs(key);
    activePaneId.value = paneId;
  }

  // Tab references die with their last tab: once no leaf carries the
  // closed key, every pool forgets it (screens, pages, call stages,
  // pinned conversations) together with its one-shot page params.
  function forgetClosedTabRefs(key) {
    if (workspaceLeaves(paneTree.value).some(leaf => (leaf.tabKeys || []).includes(key))) return;
    for (const pool of [openedPageRefs, openedScreenRefs, callPageRefs, chatPageRefs]) {
      if (pool.value.some(item => item.key === key)) {
        pool.value = pool.value.filter(item => item.key !== key);
      }
    }
    if (pageParamsByKey.value[key]) {
      const next = { ...pageParamsByKey.value };
      delete next[key];
      pageParamsByKey.value = next;
    }
  }

  function splitPane(paneId, orientation) {
    const source = panes.value.find(pane => pane.id === paneId);
    if (!source) return;
    const nextPane = defaultLeaf(`pane-${++paneSequence.value}`);
    paneTree.value = splitWorkspaceLeaf(paneTree.value, paneId, orientation, nextPane);
    activePaneId.value = nextPane.id;
  }

  function resizePaneSplit(splitId, sizes) {
    paneTree.value = updateWorkspaceSplit(paneTree.value, splitId, sizes);
  }

  function closePane(paneId) {
    if (paneCount.value <= 1) return;
    paneTree.value = closeWorkspaceLeaf(paneTree.value, paneId);
    paneHistories.value = new Map([...paneHistories.value].filter(([id]) => id !== paneId));
    activePaneId.value = workspaceLeaves(paneTree.value)[0]?.id || 'pane-1';
  }

  // A type screen opens as a pane tab in the active pane.
  function openScreenTab(screen = null) {
    if (!screen?.screenKey && !screen?.id) return;
    const screenKey = screen.screenKey || screen.id;
    const key = screenTabKey(screenKey);
    if (!openedScreenRefs.value.some(reference => reference.key === key)) {
      openedScreenRefs.value = [...openedScreenRefs.value, {
        key,
        screenKey,
        typeId: screen.typeId || ''
      }];
    }
    if (activePane.value) selectPaneTab(activePane.value.id, key);
  }

  // An instance opens as its compiled detail-screen tab; editor-bound
  // types open their editor page (the editor-protocol create does so
  // first, SPEC §UI); entity-bound workspace pages (the directory
  // surface) are the last fallback. A type with none of the three stays
  // silent, exactly like the routed surface contract.
  function openInstanceTab(typeId = '', instanceIdValue = '', { editor = false } = {}) {
    if (!typeId || !instanceIdValue || !activePane.value) return;
    const surface = resolveFileSurface(undefined, typeId);
    if (editor && surface?.workspacePage) {
      openWorkspacePage({ pageId: surface.surface, typeId, entity: { _id: instanceIdValue } });
      return;
    }
    const detail = resolveDetailScreen({ screens: authStore.screenManifest, typeId });
    if (detail) {
      const screenKey = detail.screenKey || detail.id;
      const key = screenInstanceTabKey(screenKey, instanceIdValue);
      if (!openedScreenRefs.value.some(reference => reference.key === key)) {
        openedScreenRefs.value = [...openedScreenRefs.value, {
          key,
          screenKey,
          typeId,
          instanceId: instanceIdValue
        }];
      }
      selectPaneTab(activePane.value.id, key);
      return;
    }
    if (surface?.workspacePage) {
      openWorkspacePage({ pageId: surface.surface, typeId, entity: { _id: instanceIdValue } });
      return;
    }
    const fallbackPageId = entityWorkspacePageIdFor(typeId);
    if (fallbackPageId) {
      openWorkspacePage({ pageId: fallbackPageId, typeId, entity: { _id: instanceIdValue } });
    }
  }

  function openWorkspacePage(request = {}) {
    const definition = resolveGeneratedWorkspacePage(request.pageId);
    if (!definition) return;
    if (!definition.typeId) {
      if (request.params) {
        pageParamsByKey.value = { ...pageParamsByKey.value, [pageTabKey(definition.id)]: request.params };
      }
      if (activePane.value) selectPaneTab(activePane.value.id, pageTabKey(definition.id));
      return;
    }
    if (definition.typeId !== request.typeId) return;

    if (!instanceIdOf(request.entity)) {
      const blankKey = pageTabKey(definition.id);
      if (!openedPageRefs.value.some(page => page.key === blankKey)) {
        openedPageRefs.value = [...openedPageRefs.value, {
          key: blankKey,
          pageId: definition.id,
          typeId: definition.typeId,
          instanceId: ''
        }];
      }
      if (activePane.value) selectPaneTab(activePane.value.id, blankKey);
      return;
    }

    rememberEntity(request.typeId, request.entity);

    const key = pageInstanceTabKey(definition.id, instanceIdOf(request.entity));
    if (!openedPageRefs.value.some(page => page.key === key)) {
      openedPageRefs.value = [...openedPageRefs.value, {
        key,
        pageId: definition.id,
        typeId: definition.typeId,
        instanceId: instanceIdOf(request.entity)
      }];
    }
    if (activePane.value) selectPaneTab(activePane.value.id, key);
  }

  function openEphemeralTab(pool, entry) {
    const existing = pool.value.find(item => item.key === entry.key);
    if (existing) {
      if (entry.label && existing.label !== entry.label) existing.label = entry.label;
    } else {
      pool.value = [...pool.value, entry];
    }
    if (activePane.value) selectPaneTab(activePane.value.id, entry.key, { newTab: true });
  }

  // Live call stages own their tab: a call always opens as a new tab so
  // workspace navigation never unmounts an active call.
  function openCallTab(room = '', meta = {}) {
    if (!room || !activePane.value) return;
    openEphemeralTab(callPageRefs, {
      key: room,
      room,
      conversationKey: meta.conversationKey || '',
      label: typeof meta.label === 'string' ? meta.label : ''
    });
  }

  // A pinned conversation owns its tab; the general inbox resolves through
  // the static chats page.
  function openChatTab(conversationKey = '', label = '') {
    if (!activePane.value) return;
    if (!conversationKey) {
      selectPaneTab(activePane.value.id, chatTabKey(''), { newTab: true });
      return;
    }
    openEphemeralTab(chatPageRefs, {
      key: chatTabKey(conversationKey),
      conversationKey,
      label
    });
  }

  // Registers a record in the workspace entity pool (explorer nesting,
  // page bindings): a persisted reference plus its hydrated payload. The
  // pool item itself derives from the reference.
  function rememberEntity(typeId, entity) {
    const id = instanceIdOf(entity);
    if (!typeId || !id) return makeEntityItem(typeId || '', entity || {});
    const key = entityPoolKey(typeId, entity);
    if (!openedEntityRefs.value.some(reference => reference.key === key)) {
      openedEntityRefs.value = [...openedEntityRefs.value, { key, typeId, instanceId: id }];
    }
    upgradeEntityPayload(typeId, key, entity);
    const payload = entityPayloads.value.find(item => item.key === key);
    return makeEntityItem(typeId, payload?.entity || entity);
  }

  function upgradeEntityPayload(typeId, key, entity) {
    if (entity && entity.name !== undefined) {
      entityPayloads.value = [...entityPayloads.value.filter(payload => payload.key !== key), {
        key, typeId, instanceId: instanceIdOf(entity), entity
      }];
      return;
    }
    const pooled = instances.recordFor(instances.canonicalTypeKey(typeId), instanceIdOf(entity))?.dto;
    if (pooled && pooled.name !== undefined) {
      entityPayloads.value = [...entityPayloads.value.filter(payload => payload.key !== key), {
        key, typeId, instanceId: instanceIdOf(entity), entity: pooled
      }];
    }
    // Stub payloads hydrate through the reference watch.
  }

  // Session-only pool additions (lazily fetched explorer children) never
  // enter the persisted references.
  function addSessionEntities(items) {
    const known = new Set(workspaceEntityItems.value.map(item => item.key));
    const additions = items.filter(item => item?.entity && instanceIdOf(item.entity) && !known.has(item.key));
    if (additions.length) sessionEntityItems.value = [...sessionEntityItems.value, ...additions];
  }

  // Payload hydration over the persisted references: pool first, fetch
  // second. A reference that resolves to nothing once auth has settled is
  // dead (registry churn, deleted record) and drops together with its tab.
  watch(openedEntityRefs, async refs => {
    if (!authStore.userIsSet) return;
    const sequence = ++entityLoadSequence;
    const results = await Promise.all(refs.map(async reference => {
      if (!registryStore.typeRecord(reference.typeId)) return { reference, entity: null };
      const persistedId = String(reference.instanceId || '');
      if (!persistedId || /^(null|undefined)$/.test(persistedId)) return { reference, entity: null };
      const payload = entityPayloads.value.find(item => item.key === reference.key);
      if (payload?.entity && payload.entity.name !== undefined) return { reference, entity: payload.entity };
      const pooled = instances.recordFor(instances.canonicalTypeKey(reference.typeId), persistedId)?.dto;
      if (pooled && pooled.name !== undefined) return { reference, entity: pooled };
      const fetched = await instances.resolveReadableReference(
        instances.canonicalTypeKey(reference.typeId),
        persistedId,
        { silent: true }
      ).catch(() => null);
      return { reference, entity: fetched };
    }));
    if (sequence !== entityLoadSequence) return;
    const nextPayloads = [];
    const deadKeys = new Set();
    for (const { reference, entity } of results) {
      if (entity) {
        nextPayloads.push({ key: reference.key, typeId: reference.typeId, instanceId: reference.instanceId, entity });
      } else {
        deadKeys.add(reference.key);
      }
    }
    entityPayloads.value = nextPayloads;
    if (deadKeys.size) {
      openedEntityRefs.value = openedEntityRefs.value.filter(reference => !deadKeys.has(reference.key));
    }
  }, { immediate: true, deep: true });

  function applyPersistedState(key) {
    if (!key) return;
    const state = loadHomeWorkspaceState(process.client ? window.localStorage : null, key);
    paneTree.value = state.paneTree;
    activePaneId.value = state.activePaneId;
    paneSequence.value = state.paneSequence;
    openedEntityRefs.value = state.openedEntityRefs;
    openedPageRefs.value = state.openedPageRefs;
    openedScreenRefs.value = state.openedScreenRefs;
    if (sidebarCollapsed) sidebarCollapsed.value = Boolean(state.sidebarCollapsed);
    // Session-only state dies with the previous scope (user or
    // organization switch): histories, call stages, pinned conversations,
    // transient page params, payload stubs, and session entities.
    paneHistories.value = new Map();
    callPageRefs.value = [];
    chatPageRefs.value = [];
    pageParamsByKey.value = {};
    entityPayloads.value = [];
    sessionEntityItems.value = [];
    hydratedStorageKey.value = key;
  }

  onMounted(() => {
    isMounted = true;
    if (process.client) applyPersistedState(storageKey.value);
  });

  watch(storageKey, key => {
    if (!key || !isMounted || hydratedStorageKey.value === key) return;
    applyPersistedState(key);
  });

  watch(
    [paneTree, activePaneId, paneSequence, openedEntityRefs, openedPageRefs, openedScreenRefs,
      () => sidebarCollapsed?.value],
    () => {
      const key = storageKey.value;
      if (!key || hydratedStorageKey.value !== key || typeof window === 'undefined') return;
      saveHomeWorkspaceState(window.localStorage, key, {
        paneTree: paneTree.value,
        activePaneId: activePaneId.value,
        paneSequence: paneSequence.value,
        openedEntityRefs: openedEntityRefs.value,
        openedPageRefs: openedPageRefs.value,
        openedScreenRefs: openedScreenRefs.value,
        sidebarCollapsed: sidebarCollapsed?.value
      });
    },
    { deep: true }
  );

  function itemForPane(pane) {
    return workspaceItems.value.find(item => item.key === pane?.selectionKey) || null;
  }

  function tabItemsForPane(pane) {
    return (pane?.tabKeys || [])
      .map(key => workspaceItems.value.find(item => item.key === key))
      .filter(Boolean);
  }

  return {
    paneTree,
    activePaneId,
    panes,
    paneCount,
    activePane,
    workspaceItems,
    workspaceEntityItems,
    itemForPane,
    tabItemsForPane,
    activatePane,
    selectPaneTab,
    openEmptyPaneTab,
    closePaneTab,
    splitPane,
    resizePaneSplit,
    closePane,
    goBackFromPane,
    paneHasHistory,
    openScreenTab,
    openInstanceTab,
    openWorkspacePage,
    openChatTab,
    openCallTab,
    rememberEntity,
    addSessionEntities,
    typeLabelOf,
    instanceLabelOf
  };
}

function instanceIdOf(entity = null) {
  const value = entity?._id || entity?.identity?.uid || '';
  return value ? String(value) : '';
}
