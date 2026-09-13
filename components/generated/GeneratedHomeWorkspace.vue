<template>
  <div class="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
    <div class="hidden h-full min-h-0 flex-1 overflow-hidden md:flex" data-home-workspace>
      <aside
        class="flex w-64 min-w-0 shrink-0 flex-col overflow-hidden border-r border-chrome-border bg-chrome"
        :aria-label="$t('nav.home')"
      >
        <header class="flex h-12 shrink-0 items-center border-b border-chrome-border px-3">
          <NuxtLink to="/" class="flex items-center no-underline">
            <img src="/logo-light.svg" alt="CutKit" class="h-7 w-auto dark:hidden" />
            <img src="/logo-dark.svg" alt="CutKit" class="hidden h-7 w-auto dark:block" />
          </NuxtLink>
        </header>

        <nav class="flex shrink-0 flex-col gap-1 border-b border-chrome-border p-2">
          <div class="flex min-w-0 items-center gap-1">
            <Button
              text
              size="small"
              severity="secondary"
              class="min-w-0 flex-1 !justify-start"
              icon="pi pi-comments"
              :label="$t('support.chatTitle')"
              :aria-label="$t('support.openChat')"
              @click="openChatsPage"
            />
            <Badge
              v-if="supportChatStore.totalUnread"
              :value="supportChatStore.totalUnread"
              severity="danger"
              size="small"
              class="shrink-0"
            />
          </div>
          <div class="flex min-w-0 flex-col gap-0.5 pt-1">
            <div class="flex min-w-0 items-center gap-1 px-2">
              <i class="pi pi-volume-up shrink-0" aria-hidden="true" />
              <span class="min-w-0 flex-1 truncate text-label">{{ $t('call.channels') }}</span>
              <Button
                icon="pi pi-plus"
                text
                rounded
                size="small"
                severity="secondary"
                class="shrink-0"
                :aria-label="$t('call.channelCreate')"
                @click="channelDialog = true"
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
              @click="joinRoom(orgChannelRoom)"
            />
            <div
              v-for="channel in callChannels"
              :key="channel._id"
              class="flex min-w-0 items-center gap-1"
            >
              <Button
                text
                size="small"
                severity="secondary"
                class="min-w-0 flex-1 !justify-start"
                icon="pi pi-volume-up"
                :label="channel.identity?.name || channel._id"
                :aria-label="$t('call.join')"
                @click="joinRoom(channelRoom(channel))"
              />
              <Button
                v-if="canDeleteChannel(channel)"
                icon="pi pi-trash"
                text
                rounded
                size="small"
                severity="secondary"
                class="shrink-0"
                :aria-label="$t('common.delete')"
                @click.stop="requestDeleteChannel(channel)"
              />
            </div>
          </div>
        </nav>

        <div class="min-h-0 flex-1 overflow-y-auto">
          <Tree
            v-model:selection-keys="selectionKeys"
            v-model:expanded-keys="expandedKeys"
            :value="explorerNodes"
            selection-mode="single"
            :aria-label="$t('nav.home')"
            :pt="explorerTreePt"
            @node-select="selectNode"
            @node-expand="expandNode"
          >
            <template #default="{ node }">
              <span
                v-if="node.data?.section"
                class="flex min-w-0 flex-1 items-center gap-2"
                :data-home-entity-type="node.data.section.source.entityType"
              >
                <span class="min-w-0 flex-1 truncate text-label">{{ node.label }}</span>
                <Button
                  v-if="collectionActions(node.data.section.region).length"
                  icon="pi pi-ellipsis-v"
                  text
                  rounded
                  size="small"
                  severity="secondary"
                  class="shrink-0"
                  :aria-label="$t('common.add')"
                  @click.stop="toggleSectionActions($event, node)"
                />
              </span>
              <span
                v-else
                class="flex min-w-0 flex-1 items-center gap-1"
                :data-entity-id="entityId(node.data?.item?.entity)"
              >
                <span class="flex min-w-0 flex-1 items-center">
                  <EntityInlineRef
                    :type="node.data.item.type"
                    :entity="node.data.item.entity"
                    :fetch="false"
                    :fields="[]"
                    :interactive="false"
                    variant="inline"
                  />
                </span>
                <EntityStatus
                  v-if="node.data?.item?.entity?.status"
                  :entity="node.data.item.entity"
                  :entity-type="node.data.item.type"
                  variant="icon"
                  class="shrink-0"
                  @click.stop
                  @refresh="$emit('refresh')"
                  @transitioned="$emit('refresh')"
                />
                <Button
                  v-if="rowActions(node.data?.item).length"
                  icon="pi pi-ellipsis-v"
                  text
                  rounded
                  size="small"
                  severity="secondary"
                  class="shrink-0"
                  :aria-label="$t('common.more')"
                  @click.stop="toggleChildActions($event, node)"
                />
              </span>
            </template>
          </Tree>
        </div>

        <footer class="flex shrink-0 items-center border-t border-chrome-border p-2">
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

    <StandardDialog
      v-model:visible="channelDialog"
      size="sm"
      :show-default-footer="true"
      :save-label="$t('common.add')"
      :cancel-label="$t('common.cancel')"
      :loading="channelSaving"
      @save="saveChannel"
      @cancel="channelDialog = false"
    >
      <template #header>
        <span>{{ $t('call.channelCreate') }}</span>
      </template>
      <div class="flex flex-col gap-2">
        <InputText v-model="channelName" :placeholder="$t('call.channelName')" :aria-label="$t('call.channelName')" />
      </div>
    </StandardDialog>

    <Popover ref="actionsPopover">
      <div class="flex min-w-44 flex-col gap-1" @click="hideRowActions">
        <GeneratedActionButton
          v-for="entry in rowActionEntries"
          :key="entry.action.actionId"
          :action-id="entry.action.actionId"
          menu-item
          @execute="runRowAction"
        />
      </div>
    </Popover>
    <ConfirmDialog />
  </div>
</template>

<script setup>
import { computed, provide, ref, watch } from 'vue';
import Button from 'primevue/button';
import Avatar from 'primevue/avatar';
import Badge from 'primevue/badge';
import ConfirmDialog from 'primevue/confirmdialog';
import InputText from 'primevue/inputtext';
import Popover from 'primevue/popover';
import Tree from 'primevue/tree';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import { useI18n } from 'vue-i18n';
import EntityInlineRef from '~/components/shared/EntityInlineRef.vue';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import UserAccountMenu from '~/components/shared/UserAccountMenu.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import WorkspaceSplitNode from '~/components/shared/WorkspaceSplitNode.vue';
import CallPanel from '~/components/calls/CallPanel.vue';
import GeneratedActionButton from '~/components/generated/GeneratedActionButton.vue';
import GeneratedHomeScreen from '~/components/generated/GeneratedHomeScreen.vue';
import GeneratedWorkspacePane from '~/components/generated/GeneratedWorkspacePane.vue';
import { actionAppliesToEntity, isGeneratedSurfaceAction } from '~/components/generated/action-visibility.js';
import { mergeCollectionActionContext } from '~/components/generated/action-context.js';
import { resolveGeneratedWorkspacePage, generatedWorkspacePages } from '~/components/generated/workspace-pages.js';
import { generatedDetailScreenForEntityType } from '~/components/generated/detail-screen-actions.js';
import { useAuthStore } from '~/stores/auth';
import { useEntityStore } from '~/stores/entities.js';
import { useSupportChatStore } from '~/stores/supportChat';
import { useCutkitDomainUi } from '~/composables/useCutkitDomainUi.js';
import { useEffectiveContainment } from '~/composables/useEffectiveContainment.js';
import { generatedRegionLabel } from '~/utils/generated-labels.js';
import { shouldRenderHomeSection } from '~/utils/generated-screen-source.js';
import { linkedExplorerChildSources } from '~/utils/project-linked-child-sources.js';
import { resolveEntityRelationRefs } from '~/utils/entity-relations.js';
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
const effectiveContainment = useEffectiveContainment();
const confirm = useConfirm();
const toast = useToast();
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
const channelDialog = ref(false);
const channelName = ref('');
const channelSaving = ref(false);
const callChannels = ref([]);
const actionsPopover = ref(null);
const rowActionEntries = ref([]);
const linkedChildrenByKey = ref(new Map());
const loadedChildKeys = ref(new Set());
let openedEntityLoadSequence = 0;
let childLoadSequences = new Map();
// Layout-only passthroughs: dense rows (matching the project workspace
// Explorer), full-width hover/selection with the indent carried inside the
// row content, and a label that owns the remaining width for end-aligned
// row controls.
const explorerTreePt = {
  root: { class: '!p-0' },
  nodeChildren: { style: { paddingInlineStart: '0' } },
  nodeContent: ({ props }) => ({
    class: '!gap-1 !py-0.5',
    style: {
      paddingInlineStart: `${0.5 + (Math.max(props.level || 1, 1) - 1) * 0.75}rem`,
      paddingInlineEnd: '0.25rem'
    }
  }),
  nodeToggleButton: { class: '!h-6 !w-6' },
  nodeLabel: { class: 'flex min-w-0 flex-1 items-center' }
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
// Registered pages without an entity binding are always openable tabs.
const staticPageItems = computed(() => generatedWorkspacePages
  .filter(page => !page.entityType)
  .map(page => ({ key: `page:${page.id}`, kind: 'page', pageId: page.id })));
const workspaceItems = computed(() => [
  ...workspaceEntityItems.value,
  ...openedPageItems.value,
  ...staticPageItems.value
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

watch(() => [
  authStore.userIsSet,
  authStore.organizationData?._id || authStore.userData?.organizationId
], () => {
  loadCallChannels();
}, { immediate: true });

watch([activePaneId, paneTree], syncActiveSelection);

async function loadCallChannels() {
  if (!authStore.userIsSet || process.server) return;
  try {
    callChannels.value = await $fetch('/api/livekit/channels');
  } catch {
    callChannels.value = [];
  }
}

async function saveChannel() {
  const name = channelName.value.trim();
  if (!name) return;
  channelSaving.value = true;
  try {
    const created = await $fetch('/api/livekit/channels', { method: 'POST', body: { name } });
    channelDialog.value = false;
    channelName.value = '';
    await loadCallChannels();
    joinRoom(channelRoom(created));
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 4000 });
  } finally {
    channelSaving.value = false;
  }
}

function requestDeleteChannel(channel = {}) {
  confirm.require({
    message: t('call.channelDeleteConfirm'),
    header: t('common.confirmation'),
    icon: 'pi pi-exclamation-triangle',
    accept: () => deleteCallChannel(channel)
  });
}

async function deleteCallChannel(channel = {}) {
  try {
    await $fetch(`/api/livekit/channels/${encodeURIComponent(String(channel._id))}`, { method: 'DELETE' });
    await loadCallChannels();
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 4000 });
  }
}

function canDeleteChannel(channel = {}) {
  const userId = String(authStore.userData?.id || authStore.userData?.userId || authStore.userData?._id || '');
  if (String(channel.origin?.userId || '') === userId) return true;
  const organizationId = String(authStore.organizationData?._id || authStore.userData?.organizationId || '');
  return (authStore.userData?.memberships || []).some(membership => (
    String(membership?.organizationId) === organizationId && membership?.owner === true
  ));
}

function channelRoom(channel = {}) {
  return `call:channel:${channel._id}`;
}

function joinRoom(room = '') {
  if (!room) return;
  callRoom.value = room;
  callDialog.value = true;
}

function openChatsPage() {
  if (activePane.value) selectPaneTab(activePane.value.id, 'page:chats');
}

function toggleSectionActions(event, node) {
  const section = node.data?.section;
  if (!section) return;
  rowActionEntries.value = collectionActions(section.region)
    .map(action => ({ action, context: actionContext(section) }));
  actionsPopover.value?.toggle(event);
}

function toggleChildActions(event, node) {
  const item = node.data?.item;
  if (!item) return;
  rowActionEntries.value = rowActions(item);
  actionsPopover.value?.toggle(event);
}

function hideRowActions() {
  actionsPopover.value?.hide();
}

function runRowAction(action) {
  const entry = rowActionEntries.value.find(item => item.action.actionId === (action?.actionId || action?.id));
  hideRowActions();
  if (entry) emit('execute-action', action, entry.entity ?? null, entry.context);
}

// One action channel per explorer row: compiled child-collection creates with
// the row bound as opened parent, plus the row's compiled relation Link
// actions executed against the row entity itself.
function rowActions(item = null) {
  if (!item?.entity) return [];
  return [...childCreateActions(item), ...linkActions(item)];
}

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

// Child creates for an explorer entity come from that entity type's compiled
// detail screen: every list region below the single main source contributes
// its createEntity actions with the row entity bound as the opened parent.
function linkActions(item = null) {
  const detailScreen = generatedDetailScreenForEntityType({
    screens: authStore.screenManifest,
    entityType: item.type
  });
  if (!detailScreen) return [];
  const mainRegion = (detailScreen.regions || []).find(region => (
    (detailScreen.sources || []).some(source => (
      source.id === region.sourceId
      && source.entityType === item.type
      && source.mode === 'single'
    ))
  ));
  const actionIds = [...new Set([...(mainRegion?.actions || []), ...(detailScreen.actions || [])])];
  return resolvedRegionActions({ actions: actionIds })
    .filter(action => action.relationMutation?.operation === 'link')
    .filter(isGeneratedSurfaceAction)
    .map(action => ({
      action,
      entity: item.entity,
      context: {
        parentEntity: item.entity,
        parentEntityType: item.type
      }
    }));
}

function childCreateActions(item = null) {
  if (!item?.entity) return [];
  const detailScreen = generatedDetailScreenForEntityType({
    screens: authStore.screenManifest,
    entityType: item.type
  });
  if (!detailScreen) return [];
  const entries = [];
  for (const region of detailScreen.regions || []) {
    const source = (detailScreen.sources || []).find(candidate => candidate.id === region.sourceId);
    if (!source || source.mode !== 'list' || source.entityType === item.type) continue;
    for (const action of resolvedRegionActions(region).filter(action => action.actionKind === 'createEntity')) {
      entries.push({
        action,
        context: mergeCollectionActionContext({
          incoming: {
            parentEntityType: item.type,
            parentEntity: item.entity,
            parentEntityId: entityId(item.entity)
          },
          region,
          source,
          entityType: source.entityType,
          items: []
        })
      });
    }
  }
  return entries.filter((entry, index, list) => (
    list.findIndex(candidate => candidate.action.actionId === entry.action.actionId) === index
  ));
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
  const contained = workspaceEntityItems.value.filter(candidate => (
    childrenByKey.value.get(candidate.key) === item.key
  ));
  const containedKeys = new Set(contained.map(child => child.key));
  const linked = (linkedChildrenByKey.value.get(item.key) || [])
    .map(key => workspaceEntityItems.value.find(candidate => candidate.key === key))
    .filter(Boolean)
    .filter(candidate => !containedKeys.has(candidate.key));
  const children = [...contained, ...linked];
  const expandable = declaredChildren || hasRelationRefs(item.entity) || children.length > 0;
  return {
    key: item.key,
    // The inline entity chip owns the entity icon; a tree-level icon would
    // duplicate it.
    data: { item },
    leaf: !expandable,
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
  const [sourceChildren, relationChildren] = await Promise.all([
    loadContainmentChildren(parent),
    loadRelationChildren(parent)
  ]);
  if (childLoadSequences.get(parent.key) !== sequence) return;
  const known = new Set(workspaceEntityItems.value.map(item => item.key));
  const additions = [...sourceChildren, ...relationChildren]
    .filter(item => item?.entity && entityId(item.entity) && !known.has(item.key));
  if (additions.length) openedEntityItems.value = [...openedEntityItems.value, ...additions];
  linkedChildrenByKey.value = new Map([
    ...linkedChildrenByKey.value,
    [parent.key, relationChildren.map(item => item.key).filter(Boolean)]
  ]);
}

async function loadContainmentChildren(parent) {
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
  return loaded.flat();
}

// Declared relation links participate in the hierarchy beside containment:
// expanding a row resolves its relation refs through the canonical entity DTO
// (fetching the full record when the list DTO omits relations) and hydrates
// the referenced entities into the workspace pool as row children.
async function loadRelationChildren(parent) {
  let entity = parent.entity;
  if (!entity?.relations) {
    try {
      entity = await entityStore.fetchEntity(parent.type, entityId(entity), false, { silent: true }) || entity;
    } catch {
      entity = entity;
    }
  }
  const refs = relationRefsFor(entity);
  const loaded = await Promise.all(refs.map(async ref => {
    const existing = workspaceEntityItems.value.find(item => (
      item.type === ref.entityType && entityId(item.entity) === ref.id
    ));
    const resolved = existing?.entity
      || ref.entity
      || await entityStore.fetchEntity(ref.entityType, ref.id, false, { silent: true }).catch(() => null);
    return resolved ? workspaceEntityItem(ref.entityType, resolved) : null;
  }));
  return loaded.filter(Boolean);
}

function relationRefsFor(entity = {}) {
  return Object.values(entity?.relations || {}).flatMap(value => resolveEntityRelationRefs(value));
}

function hasRelationRefs(entity = {}) {
  return relationRefsFor(entity).length > 0;
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

