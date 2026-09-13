<template>
  <div class="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
    <div class="hidden h-full min-h-0 flex-1 overflow-hidden md:flex" data-home-workspace>
      <aside
        class="home-explorer flex w-64 min-w-0 shrink-0 flex-col overflow-hidden border-r border-content-border bg-chrome"
        :aria-label="$t('nav.home')"
      >
        <header class="flex h-12 shrink-0 items-center border-b [border-color:var(--ck-chrome-border)] px-3">
          <NuxtLink to="/" class="flex items-center no-underline">
            <img src="/logo-light.svg" alt="CutKit" class="h-7 w-auto dark:hidden" />
            <img src="/logo-dark.svg" alt="CutKit" class="hidden h-7 w-auto dark:block" />
          </NuxtLink>
        </header>

        <nav class="flex shrink-0 flex-col gap-1 border-b [border-color:var(--ck-chrome-border)] p-2">
          <div class="flex min-w-0 items-center gap-1">
            <Button
              text
              size="small"
              severity="secondary"
              class="min-w-0 flex-1 !justify-start"
              icon="pi pi-comments"
              :label="$t('support.chatTitle')"
              :aria-label="$t('support.openChat')"
              @click="openChats"
            />
            <Badge
              v-if="supportChatStore.totalUnread"
              :value="supportChatStore.totalUnread"
              severity="danger"
              size="small"
              class="shrink-0"
            />
          </div>
          <Button
            text
            size="small"
            severity="secondary"
            class="w-full !justify-start"
            icon="pi pi-volume-up"
            :label="orgChannelLabel"
            :aria-label="$t('call.join')"
            @click="joinOrgChannel"
          />
        </nav>

        <Tree
          v-model:selection-keys="selectionKeys"
          v-model:expanded-keys="expandedKeys"
          :value="explorerNodes"
          selection-mode="single"
          :aria-label="$t('nav.home')"
          class="home-explorer-tree min-h-0 min-w-0 max-w-full flex-1 overflow-x-hidden overflow-y-auto !border-0 !p-1"
          :pt="explorerTreePt"
          @node-select="selectNode"
          @node-expand="expandNode"
        >
          <template #default="{ node }">
            <div
              v-if="node.data?.section"
              class="flex min-w-0 max-w-full flex-1 items-center gap-2"
              :data-home-entity-type="node.data.section.source.entityType"
            >
              <i :class="node.icon" class="shrink-0" aria-hidden="true" />
              <span class="min-w-0 flex-1 truncate text-label">{{ node.label }}</span>
              <GeneratedActionButton
                v-for="action in collectionActions(node.data.section.region)"
                :key="action.actionId"
                :action-id="action.actionId"
                icon-only
                @execute="selectedAction => emit('execute-action', selectedAction, null, actionContext(node.data.section))"
              />
            </div>
            <div
              v-else
              class="flex min-w-0 max-w-full flex-1 items-center gap-2"
              :data-entity-id="entityId(node.data?.item?.entity)"
            >
              <IdentityBlock :entity="node.data?.item?.entity" variant="compact" class="min-w-0 flex-1" />
              <EntityStatus
                v-if="node.data?.item?.entity?.status"
                :entity="node.data.item.entity"
                :entity-type="node.data.item.type"
                variant="icon"
                @click.stop
                @refresh="$emit('refresh')"
                @transitioned="$emit('refresh')"
              />
            </div>
          </template>
        </Tree>

        <footer class="flex shrink-0 items-center border-t [border-color:var(--ck-chrome-border)] p-2">
          <UserAccountMenu class="min-w-0 flex-1">
            <template #trigger="{ toggle }">
              <Button
                data-testid="user-menu-trigger"
                text
                size="small"
                severity="secondary"
                class="w-full !justify-start !px-2"
                :aria-label="$t('nav.profile')"
                @click="toggle"
              >
                <Avatar
                  :image="authStore.userData.avatarUrl || null"
                  :label="!authStore.userData.avatarUrl && authStore.userData.name ? authStore.userData.name[0].toUpperCase() : null"
                  shape="circle"
                  size="small"
                  class="shrink-0 bg-primary text-primary-contrast [&_.p-avatar-image]:h-full [&_.p-avatar-image]:w-full [&_.p-avatar-image]:object-cover"
                />
                <span class="m-0 min-w-0 flex-1 truncate text-left text-label">
                  {{ authStore.userData.name || $t('common.user') }}
                </span>
                <i class="pi pi-chevron-up shrink-0" aria-hidden="true" />
              </Button>
            </template>
          </UserAccountMenu>
        </footer>
      </aside>

      <div class="min-h-0 min-w-0 flex-1 overflow-hidden">
        <WorkspaceSplitNode
          :node="paneTree"
          :active-pane-id="activePaneId"
          @activate="activatePane"
          @resize="resizePaneSplit"
        >
          <template #default="{ pane }">
            <GeneratedWorkspacePane
              :item="itemForPane(pane)"
              :tabs="tabItemsForPane(pane)"
              :available-tabs="workspaceItems"
              :action-entries="actionEntriesForPane(pane)"
              :closeable="paneCount > 1"
              @execute-action="executeWorkspaceAction"
              @open-entity="request => openWorkspaceEntity(request.entityType, request.entity)"
              @open-page="openWorkspacePage"
              @refresh="$emit('refresh')"
              @select-tab="key => selectPaneTab(pane.id, key)"
              @close-tab="key => closePaneTab(pane.id, key)"
              @add-tab="key => selectPaneTab(pane.id, key)"
              @split="orientation => splitPane(pane.id, orientation)"
              @close="closePane(pane.id)"
            />
          </template>
        </WorkspaceSplitNode>
      </div>
    </div>

    <div class="flex h-full min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-4 pb-6 md:hidden">
      <GeneratedHomeScreen
        :screen="screen"
        :source-state="sourceState"
        @refresh="$emit('refresh')"
        @execute-action="(action, entity, context) => $emit('execute-action', action, entity, context)"
      />
    </div>

    <StandardDialog
      v-model:visible="callDialog"
      :header="$t('call.title')"
      size="full"
      :show-default-footer="false"
    >
      <div class="flex h-support-chat flex-col">
        <CallPanel v-if="callDialog && callRoom" :key="callRoom" :room="callRoom" @closed="callDialog = false" />
      </div>
    </StandardDialog>
  </div>
</template>

<script setup>
import { computed, provide, ref, watch } from 'vue';
import Button from 'primevue/button';
import Avatar from 'primevue/avatar';
import Badge from 'primevue/badge';
import Tree from 'primevue/tree';
import { useI18n } from 'vue-i18n';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import UserAccountMenu from '~/components/shared/UserAccountMenu.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import WorkspaceSplitNode from '~/components/shared/WorkspaceSplitNode.vue';
import CallPanel from '~/components/calls/CallPanel.vue';
import GeneratedActionButton from '~/components/generated/GeneratedActionButton.vue';
import GeneratedHomeScreen from '~/components/generated/GeneratedHomeScreen.vue';
import GeneratedWorkspacePane from '~/components/generated/GeneratedWorkspacePane.vue';
import { actionAppliesToEntity, isGeneratedSurfaceAction } from '~/components/generated/action-visibility.js';
import { resolveGeneratedWorkspacePage } from '~/components/generated/workspace-pages.js';
import { useAuthStore } from '~/stores/auth';
import { useEntityStore } from '~/stores/entities.js';
import { useSupportChatStore } from '~/stores/supportChat';
import { useSupportDialog } from '~/composables/useModalState';
import { useCutkitDomainUi } from '~/composables/useCutkitDomainUi.js';
import { useEffectiveContainment } from '~/composables/useEffectiveContainment.js';
import { generatedRegionLabel } from '~/utils/generated-labels.js';
import { shouldRenderHomeSection } from '~/utils/generated-screen-source.js';
import { linkedExplorerChildSources } from '~/utils/project-linked-child-sources.js';
import { containmentParent, normalizeHierarchyType } from '~/utils/entity-hierarchy.js';
import {
  closeWorkspaceLeaf,
  createWorkspaceLeaf,
  splitWorkspaceLeaf,
  updateWorkspaceLeaf,
  updateWorkspaceSplit,
  workspaceLeaves
} from '~/utils/workspace-splits.js';
import {
  homeWorkspaceStorageKey,
  loadHomeWorkspaceState,
  saveHomeWorkspaceState
} from '~/utils/home-workspace-state.js';

const props = defineProps({
  screen: { type: Object, required: true },
  sourceState: { type: Function, required: true },
  screenActions: { type: Array, default: () => [] }
});

const emit = defineEmits(['refresh', 'execute-action']);

const authStore = useAuthStore();
const entityStore = useEntityStore();
const domainUi = useCutkitDomainUi();
const supportChatStore = useSupportChatStore();
const supportDialog = useSupportDialog();
const effectiveContainment = useEffectiveContainment();
const { t, te } = useI18n();
const activePaneId = ref('pane-1');
const paneSequence = ref(1);
const paneTree = ref(createWorkspaceLeaf('pane-1'));
const selectionKeys = ref({});
const expandedKeys = ref({});
const openedEntityRefs = ref([]);
const openedPageRefs = ref([]);
const openedEntityItems = ref([]);
const hydratedStorageKey = ref('');
const callDialog = ref(false);
const callRoom = ref('');
const loadedChildKeys = ref(new Set());
let openedEntityLoadSequence = 0;
let childLoadSequences = new Map();
const explorerTreePt = {
  root: { class: '!min-w-0 !max-w-full !overflow-hidden' },
  node: { class: '!min-w-0 !max-w-full !overflow-hidden' },
  nodeContent: { class: '!min-w-0 !max-w-full !overflow-hidden !px-1 !py-0.5 !gap-1' },
  nodeLabel: { class: '!min-w-0 !overflow-hidden' },
  nodeToggleButton: { class: '!h-6 !w-6' }
};

provide('displayedEntityContexts', computed(() => []));

const sections = computed(() => props.screen.regions
  .map(region => {
    const state = props.sourceState(region.sourceId);
    return {
      region,
      source: state.source || {},
      items: state.items || [],
      rawItems: state.rawItems || state.items || []
    };
  })
  .filter(section => section.source.entityType && shouldRenderHomeSection(section)));

const sectionItems = computed(() => sections.value.flatMap(section => section.items
  .filter(entity => entityId(entity))
  .map(entity => workspaceEntityItem(section.source.entityType, entity))));
const workspaceEntityItems = computed(() => [...sectionItems.value, ...openedEntityItems.value]
  .filter((item, index, items) => items.findIndex(candidate => candidate.key === item.key) === index));
const cassetteItems = computed(() => workspaceEntityItems.value.filter(item => item.type === 'cassette'));
const openedPageItems = computed(() => openedPageRefs.value.map(reference => {
  const entityItem = workspaceEntityItems.value.find(item => (
    item.type === reference.entityType
    && entityId(item.entity) === reference.entityId
  ));
  if (!entityItem) return null;
  return {
    key: reference.key,
    kind: 'page',
    pageId: reference.pageId,
    entity: entityItem.entity,
    entityType: reference.entityType,
    cassettes: cassetteItems.value.map(item => item.entity)
  };
}).filter(Boolean));
const workspaceItems = computed(() => [
  ...workspaceEntityItems.value,
  ...openedPageItems.value
].filter(Boolean).filter((item, index, items) => (
  items.findIndex(candidate => candidate.key === item.key) === index
)));
const panes = computed(() => workspaceLeaves(paneTree.value));
const paneCount = computed(() => panes.value.length);
const activePane = computed(() => panes.value.find(pane => pane.id === activePaneId.value) || panes.value[0]);
const workspaceStorageKey = computed(() => homeWorkspaceStorageKey({
  userId: authStore.userData?.id || authStore.userData?.userId || authStore.userData?._id,
  organizationId: authStore.organizationData?._id || authStore.userData?.organizationId
}));
const orgChannelLabel = computed(() => (
  authStore.organizationData?.identity?.name
  || authStore.organizationData?.data?.name
  || t('call.orgChannel')
));
const orgChannelRoom = computed(() => {
  const organizationId = authStore.organizationData?._id || authStore.userData?.organizationId;
  return organizationId ? `call:org:${organizationId}` : '';
});

// Items nested under another loaded workspace item through the effective
// containment graph: lazily fetched explorer children and entities opened
// from nested surfaces both nest beneath their loaded ancestor.
const childrenByKey = computed(() => {
  const containment = effectiveContainment();
  const byIdentity = new Map(workspaceEntityItems.value.map(item => [
    `${normalizeHierarchyType(item.type)}:${entityId(item.entity)}`,
    item
  ]));
  const children = new Map();
  for (const item of workspaceEntityItems.value) {
    const parent = containmentParent(item.type, item.entity?.lineage || {}, containment);
    const parentId = parent && item.entity?.lineage?.[parent.lineageKey];
    const parentItem = parentId ? byIdentity.get(`${normalizeHierarchyType(parent.parentType)}:${String(parentId)}`) : null;
    if (!parentItem || parentItem.key === item.key) continue;
    if (sectionRootKeys.value.has(item.key)) continue;
    children.set(item.key, parentItem.key);
  }
  return children;
});
const sectionRootKeys = computed(() => new Set(sectionItems.value.map(item => item.key)));

const explorerNodes = computed(() => sections.value
  .map(section => ({
    key: sectionMenuKey(section),
    label: sectionLabel(section),
    icon: sectionIcon(section),
    selectable: false,
    data: { section },
    children: sectionItemsFor(section.region.id).map(item => entityNode(item))
  })));

watch(sections, value => {
  const next = { ...expandedKeys.value };
  for (const section of value) {
    const key = sectionMenuKey(section);
    if (!(key in next)) next[key] = true;
  }
  expandedKeys.value = next;
}, { immediate: true });

watch(workspaceStorageKey, key => {
  if (!key || typeof window === 'undefined') return;
  const state = loadHomeWorkspaceState(window.localStorage, key);
  paneTree.value = state.paneTree;
  activePaneId.value = state.activePaneId;
  paneSequence.value = state.paneSequence;
  openedEntityRefs.value = state.openedEntityRefs;
  openedPageRefs.value = state.openedPageRefs;
  hydratedStorageKey.value = key;
  syncActiveSelection();
}, { immediate: true });

watch(
  [paneTree, activePaneId, paneSequence, openedEntityRefs, openedPageRefs],
  () => {
    const key = workspaceStorageKey.value;
    if (!key || hydratedStorageKey.value !== key || typeof window === 'undefined') return;
    saveHomeWorkspaceState(window.localStorage, key, {
      paneTree: paneTree.value,
      activePaneId: activePaneId.value,
      paneSequence: paneSequence.value,
      openedEntityRefs: openedEntityRefs.value,
      openedPageRefs: openedPageRefs.value
    });
  },
  { deep: true }
);

watch(openedEntityRefs, async refs => {
  const sequence = ++openedEntityLoadSequence;
  const loaded = await Promise.all(refs.map(async reference => {
    const existing = workspaceEntityItems.value.find(item => (
      item.type === reference.entityType && entityId(item.entity) === reference.entityId
    ));
    const entity = existing?.entity
      || await entityStore.fetchEntity(reference.entityType, reference.entityId, false, { silent: true });
    return entity ? workspaceEntityItem(reference.entityType, entity) : null;
  }));
  if (sequence !== openedEntityLoadSequence) return;
  openedEntityItems.value = loaded.filter(Boolean);
}, { immediate: true, deep: true });

watch([activePaneId, paneTree], syncActiveSelection);

function collectionActions(region = {}) {
  return resolvedRegionActions(region)
    .filter(action => action?.actionKind === 'createEntity');
}

function resolvedRegionActions(region = {}) {
  return [...new Map((region.actions || [])
    .map(actionId => authStore.actionManifest.find(action => action.actionId === actionId))
    .filter(Boolean)
    .map(action => [action.actionId || action.id, action])).values()];
}

function actionContext(section = {}) {
  return {
    region: section.region,
    source: section.source,
    entityType: section.source.entityType,
    parentEntityType: section.source.entityType,
    parentOptions: section.items.map(entity => ({
      label: entity.identity?.name || entity.identity?.uid || entity._id,
      value: entity._id || entity.identity?.uid,
      entity
    }))
  };
}

function sectionLabel(section = {}) {
  return generatedRegionLabel(section.region, section.source, { t, te });
}

function sectionIcon(section = {}) {
  return domainUi.getIcon(section.source.entityType);
}

function sectionMenuKey(section = {}) {
  return `section:${section.region.id}`;
}

function sectionItemsFor(regionId) {
  const section = sections.value.find(candidate => candidate.region.id === regionId);
  return section ? sectionItems.value.filter(item => (
    item.type === section.source.entityType
    && section.items.some(entity => entityId(entity) === entityId(item.entity))
  )) : [];
}

function entityNode(item) {
  const declaredChildren = effectiveContainment().some(relation => (
    relation.parentType === item.type
  ));
  const children = workspaceEntityItems.value.filter(candidate => childrenByKey.value.get(candidate.key) === item.key);
  return {
    key: item.key,
    icon: domainUi.getIcon(item.type),
    data: { item },
    leaf: !declaredChildren && children.length === 0,
    children: children.length ? children.map(entityNode) : undefined
  };
}

function selectNode(node) {
  const item = node.data?.item;
  if (!item) return;
  selectByKey(item.key);
}

function expandNode(node) {
  const item = node.data?.item;
  if (item) loadChildrenFor(item);
}

async function loadChildrenFor(parent) {
  if (!parent || loadedChildKeys.value.has(parent.key)) return;
  loadedChildKeys.value.add(parent.key);
  const sequence = (childLoadSequences.get(parent.key) || 0) + 1;
  childLoadSequences.set(parent.key, sequence);
  const sources = linkedExplorerChildSources({
    linkedItems: [parent],
    screens: authStore.screenManifest,
    containment: effectiveContainment()
  });
  const loaded = await Promise.all(sources.map(async source => {
    try {
      const entities = await $fetch(domainUi.getListEndpoint(source.entityType, source.filters));
      return (Array.isArray(entities) ? entities : []).map(entity => workspaceEntityItem(source.entityType, entity));
    } catch {
      return [];
    }
  }));
  if (childLoadSequences.get(parent.key) !== sequence) return;
  const known = new Set(workspaceEntityItems.value.map(item => item.key));
  const additions = loaded.flat().filter(item => item?.entity && entityId(item.entity) && !known.has(item.key));
  if (additions.length) openedEntityItems.value = [...openedEntityItems.value, ...additions];
}

function openChats() {
  supportDialog.value = true;
}

function joinOrgChannel() {
  if (!orgChannelRoom.value) return;
  callRoom.value = orgChannelRoom.value;
  callDialog.value = true;
}

function activatePane(paneId) {
  activePaneId.value = paneId;
}

function selectByKey(key) {
  if (!workspaceItems.value.some(item => item.key === key) || !activePane.value) return;
  selectPaneTab(activePane.value.id, key);
}

function selectPaneTab(paneId, key) {
  const pane = panes.value.find(item => item.id === paneId);
  if (!pane || !workspaceItems.value.some(item => item.key === key)) return;
  const tabKeys = [...new Set([...(pane.tabKeys || []), key])];
  paneTree.value = updateWorkspaceLeaf(paneTree.value, paneId, { selectionKey: key, tabKeys });
  activePaneId.value = paneId;
  syncActiveSelection();
}

function closePaneTab(paneId, key) {
  const pane = panes.value.find(item => item.id === paneId);
  if (!pane) return;
  const currentKeys = pane.tabKeys || [];
  const closingIndex = currentKeys.indexOf(key);
  if (closingIndex < 0) return;
  const tabKeys = currentKeys.filter(tabKey => tabKey !== key);
  const selectionKey = pane.selectionKey === key
    ? (tabKeys[Math.max(0, closingIndex - 1)] || '')
    : pane.selectionKey;
  const nextTree = updateWorkspaceLeaf(paneTree.value, paneId, { selectionKey, tabKeys });
  paneTree.value = nextTree;
  const remainingTabKeys = new Set(workspaceLeaves(nextTree).flatMap(leaf => leaf.tabKeys || []));
  if (!remainingTabKeys.has(key)) {
    openedPageRefs.value = openedPageRefs.value.filter(reference => reference.key !== key);
  }
  activePaneId.value = paneId;
  syncActiveSelection();
}

function splitPane(paneId, orientation) {
  const source = panes.value.find(pane => pane.id === paneId);
  if (!source) return;
  const nextPane = createWorkspaceLeaf(`pane-${++paneSequence.value}`);
  paneTree.value = splitWorkspaceLeaf(paneTree.value, paneId, orientation, nextPane);
  activePaneId.value = nextPane.id;
}

function resizePaneSplit(splitId, sizes) {
  paneTree.value = updateWorkspaceSplit(paneTree.value, splitId, sizes);
}

function closePane(paneId) {
  if (paneCount.value <= 1) return;
  paneTree.value = closeWorkspaceLeaf(paneTree.value, paneId);
  activePaneId.value = workspaceLeaves(paneTree.value)[0]?.id || 'pane-1';
}

function openWorkspaceEntity(entityType, entity) {
  const item = rememberWorkspaceEntity(entityType, entity);
  if (!item || !activePane.value) return;
  selectPaneTab(activePane.value.id, item.key);
}

function openWorkspacePage(request = {}) {
  const definition = resolveGeneratedWorkspacePage(request.pageId);
  if (!definition) return;
  if (!definition.entityType) {
    if (activePane.value) selectPaneTab(activePane.value.id, `page:${definition.id}`);
    return;
  }
  if (definition.entityType !== request.entityType) return;

  rememberWorkspaceEntity(request.entityType, request.entity);

  const entityItem = workspaceEntityItems.value.find(item => (
    item.type === definition.entityType
    && entityId(item.entity) === entityId(request.entity)
  ));
  if (!entityItem || !activePane.value) return;

  const key = workspacePageKey(definition.id, entityItem.entity);
  if (!openedPageRefs.value.some(page => page.key === key)) {
    openedPageRefs.value = [...openedPageRefs.value, {
      key,
      pageId: definition.id,
      entityType: definition.entityType,
      entityId: entityId(entityItem.entity)
    }];
  }
  selectPaneTab(activePane.value.id, key);
}

function rememberWorkspaceEntity(entityType, entity) {
  const id = entityId(entity);
  if (!entityType || !id) return null;
  const key = entityKey(entityType, entity);
  const existing = workspaceEntityItems.value.find(item => item.key === key);
  if (existing) return existing;

  const item = workspaceEntityItem(entityType, entity);
  openedEntityItems.value = [...openedEntityItems.value, item];
  if (!openedEntityRefs.value.some(reference => reference.key === key)) {
    openedEntityRefs.value = [...openedEntityRefs.value, {
      key,
      entityType,
      entityId: id
    }];
  }
  return item;
}

function executeWorkspaceAction(action, entry = {}) {
  emit('execute-action', action, entry.entity ?? null, entry.context || contextForItem(entry.item));
}

function actionEntriesForPane(pane) {
  const item = itemForPane(pane);
  if (!item || item.kind !== 'entity') return [];
  const section = sections.value.find(candidate => candidate.region === item.region);
  return entityActionEntries(
    [...(item.region?.actions || []), ...(props.screenActions || [])],
    item,
    section ? actionContext(section) : contextForItem(item)
  );
}

function entityActionEntries(actionIds, item, context = {}) {
  return [...new Set(actionIds)]
    .map(actionId => authStore.actionManifest.find(action => action.actionId === actionId))
    .filter(Boolean)
    .filter(isGeneratedSurfaceAction)
    .filter(action => actionAppliesToEntity(action, item.entity, item.type))
    .map(action => ({
      key: `${item.key}:${action.actionId}`,
      actionId: action.actionId,
      entity: item.entity,
      item,
      context
    }));
}

function contextForItem(item = null) {
  return {
    entityType: item?.type || '',
    parentEntityType: item?.type || ''
  };
}

function itemForPane(pane) {
  return workspaceItems.value.find(item => item.key === pane?.selectionKey)
    || null;
}

function tabItemsForPane(pane) {
  return (pane?.tabKeys || [])
    .map(key => workspaceItems.value.find(item => item.key === key))
    .filter(Boolean);
}

function syncActiveSelection() {
  const key = activePane.value?.selectionKey || '';
  selectionKeys.value = key ? { [key]: true } : {};
}

function workspacePageKey(pageId, entity) {
  return `page:${pageId}:${entityId(entity)}`;
}

function entityKey(type, entity) {
  return `${type}:${entityId(entity)}`;
}

function workspaceEntityItem(type, entity) {
  return {
    key: entityKey(type, entity),
    kind: 'entity',
    type,
    entity,
    region: sectionRegionForEntity(type, entity)
  };
}

function sectionRegionForEntity(type, entity) {
  const section = sections.value.find(candidate => (
    candidate.source.entityType === type
    && candidate.items.some(item => entityId(item) === entityId(entity))
  ));
  return section?.region || null;
}

function entityId(entity = null) {
  const value = entity?._id || entity?.identity?.uid || '';
  return value ? String(value) : '';
}
</script>

<style scoped>
.home-explorer {
  container-type: inline-size;
}

.home-explorer-tree :deep(.p-tree-root),
.home-explorer-tree :deep(.p-tree-node),
.home-explorer-tree :deep(.p-tree-node-content),
.home-explorer-tree :deep(.p-tree-node-label),
.home-explorer-tree :deep(.p-tree-node-children) {
  min-width: 0;
  max-width: 100%;
}

.home-explorer-tree :deep(.p-tree-node-content),
.home-explorer-tree :deep(.p-tree-node-label) {
  overflow: hidden;
}
</style>
