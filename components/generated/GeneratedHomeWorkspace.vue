<template>
  <div class="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
    <div class="hidden h-full min-h-0 flex-1 overflow-hidden md:flex" data-home-workspace>
      <aside
        class="flex w-64 min-w-0 shrink-0 flex-col overflow-hidden border-r border-content-border bg-chrome text-[var(--ck-chrome-foreground)]"
        :aria-label="$t('nav.home')"
      >
        <header class="flex h-12 shrink-0 items-center border-b [border-color:var(--ck-chrome-border)] px-3">
          <NuxtLink to="/" class="flex items-center no-underline">
            <img src="/logo-light.svg" alt="CutKit" class="h-7 w-auto dark:hidden" />
            <img src="/logo-dark.svg" alt="CutKit" class="hidden h-7 w-auto dark:block" />
          </NuxtLink>
        </header>

        <nav class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-2">
          <section
            v-for="section in sections"
            :key="section.region.id"
            class="flex min-w-0 flex-col"
            :data-home-entity-type="section.source.entityType"
          >
            <div class="flex min-w-0 items-center gap-1 px-2 py-1">
              <i :class="sectionIcon(section)" class="shrink-0 text-[var(--ck-chrome-muted)]" aria-hidden="true" />
              <span class="m-0 min-w-0 flex-1 truncate text-supporting text-[var(--ck-chrome-muted)]">
                {{ sectionLabel(section) }}
              </span>
              <GeneratedActionButton
                v-for="action in collectionActions(section.region)"
                :key="action.actionId"
                :action-id="action.actionId"
                icon-only
                @execute="selectedAction => emit('execute-action', selectedAction, null, actionContext(section))"
              />
              <Button
                v-if="sectionRoute(section)"
                icon="pi pi-arrow-right"
                text
                rounded
                size="small"
                severity="secondary"
                class="shrink-0 !text-[var(--ck-chrome-foreground)]"
                :aria-label="sectionLabel(section)"
                @click="navigateTo(sectionRoute(section))"
              />
            </div>
            <div
              v-for="entity in section.items"
              :key="entity._id || entity.id || entity.identity?.uid"
              class="flex min-w-0 items-center gap-1"
              :data-entity-id="entity._id || entity.id || entity.identity?.uid"
            >
              <Button
                text
                size="small"
                :severity="isActiveItem(section, entity) ? 'primary' : 'secondary'"
                class="min-w-0 flex-1 !justify-start"
                :aria-current="isActiveItem(section, entity) ? 'true' : undefined"
                @click="openWorkspaceEntity(section.source.entityType, entity)"
              >
                <span class="flex min-w-0 flex-1 items-center gap-2">
                  <IdentityBlock :entity="entity" variant="compact" class="min-w-0 flex-1" />
                </span>
              </Button>
              <EntityStatus
                v-if="entity.status"
                :entity="entity"
                :entity-type="section.source.entityType"
                variant="icon"
                @refresh="$emit('refresh')"
                @transitioned="$emit('refresh')"
              />
            </div>
          </section>
        </nav>

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
                <span class="m-0 min-w-0 flex-1 truncate text-left text-label !text-[var(--ck-chrome-foreground)]">
                  {{ authStore.userData.name || $t('common.user') }}
                </span>
                <i class="pi pi-chevron-up shrink-0 text-[var(--ck-chrome-muted)]" aria-hidden="true" />
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
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import Button from 'primevue/button';
import Avatar from 'primevue/avatar';
import { useI18n } from 'vue-i18n';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import UserAccountMenu from '~/components/shared/UserAccountMenu.vue';
import WorkspaceSplitNode from '~/components/shared/WorkspaceSplitNode.vue';
import GeneratedActionButton from '~/components/generated/GeneratedActionButton.vue';
import GeneratedHomeScreen from '~/components/generated/GeneratedHomeScreen.vue';
import GeneratedWorkspacePane from '~/components/generated/GeneratedWorkspacePane.vue';
import { actionAppliesToEntity, isGeneratedSurfaceAction } from '~/components/generated/action-visibility.js';
import { resolveGeneratedWorkspacePage } from '~/components/generated/workspace-pages.js';
import { useAuthStore } from '~/stores/auth';
import { useEntityStore } from '~/stores/entities.js';
import { useCutkitDomainUi } from '~/composables/useCutkitDomainUi.js';
import { generatedRegionLabel } from '~/utils/generated-labels.js';
import { shouldRenderHomeSection } from '~/utils/generated-screen-source.js';
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
const { t, te } = useI18n();
const activePaneId = ref('pane-1');
const paneSequence = ref(1);
const paneTree = ref(createWorkspaceLeaf('pane-1'));
const openedEntityRefs = ref([]);
const openedPageRefs = ref([]);
const openedEntityItems = ref([]);
const hydratedStorageKey = ref('');
let openedEntityLoadSequence = 0;

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

watch(workspaceStorageKey, key => {
  if (!key || typeof window === 'undefined') return;
  const state = loadHomeWorkspaceState(window.localStorage, key);
  paneTree.value = state.paneTree;
  activePaneId.value = state.activePaneId;
  paneSequence.value = state.paneSequence;
  openedEntityRefs.value = state.openedEntityRefs;
  openedPageRefs.value = state.openedPageRefs;
  hydratedStorageKey.value = key;
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

function sectionRoute(section = {}) {
  if (section.region.route) return section.region.route;
  const entityType = section.source.entityType;
  const screen = authStore.screenManifest.find(item => (
    item.template === 'entityList'
    && item.entityType === entityType
    && (item.screenKey || item.id) === section.region.screenKey
  )) || authStore.screenManifest.find(item => (
    item.template === 'entityList'
    && item.entityType === entityType
    && item.placement === 'hub'
  ));
  return screen?.route || '';
}

function sectionLabel(section = {}) {
  return generatedRegionLabel(section.region, section.source, { t, te });
}

function sectionIcon(section = {}) {
  return domainUi.getIcon(section.source.entityType);
}

function isActiveItem(section = {}, entity = {}) {
  return Boolean(activePane.value?.selectionKey === entityKey(section.source.entityType, entity));
}

function activatePane(paneId) {
  activePaneId.value = paneId;
}

function selectPaneTab(paneId, key) {
  const pane = panes.value.find(item => item.id === paneId);
  if (!pane || !workspaceItems.value.some(item => item.key === key)) return;
  const tabKeys = [...new Set([...(pane.tabKeys || []), key])];
  paneTree.value = updateWorkspaceLeaf(paneTree.value, paneId, { selectionKey: key, tabKeys });
  activePaneId.value = paneId;
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
