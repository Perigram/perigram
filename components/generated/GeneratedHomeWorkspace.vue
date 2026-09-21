<template>
  <div class="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
    <div class="hidden h-full min-h-0 flex-1 overflow-hidden md:flex" data-home-workspace>
      <aside
        class="flex w-64 min-w-0 shrink-0 flex-col border-r border-chrome-border"
        :aria-label="$t('nav.home')"
      >
        <header class="flex h-12 shrink-0 items-center border-b border-chrome-border px-3">
          <NuxtLink to="/" class="flex items-center no-underline">
            <img src="/logo-light.svg" alt="CutKit" class="h-7 w-auto dark:hidden" />
            <img src="/logo-dark.svg" alt="CutKit" class="hidden h-7 w-auto dark:block" />
          </NuxtLink>
        </header>

        <nav
          class="relative z-50 flex shrink-0 flex-col border-b border-chrome-border p-2"
          :aria-label="$t('support.chatTitle')"
        >
          <!-- Layered above pane content: the TieredMenu flyout submenu is an
               absolutely positioned child that must overlay the pane area. -->
          <CommunicationMenu
            @open-chats="openChatsPage"
            @start-call="startCallFromConversation"
          />
          <!-- Ongoing calls live directly in the sidebar as persistent rows;
               only brand-new invites float (IncomingCalls). -->
          <div v-if="callsStore.activeRooms.length" class="mt-2 flex flex-col gap-1" data-active-calls>
            <small class="px-2 text-muted text-supporting">{{ $t('call.activeRooms') }}</small>
            <Button
              v-for="room in callsStore.activeRooms"
              :key="room.room"
              text
              severity="secondary"
              size="small"
              class="w-full !justify-start !gap-2"
              :aria-label="$t('call.join')"
              @click="openCallTab(room.room, { conversationKey: conversationKeyForRoom(room.room) })"
            >
              <i :class="callRoomIcon(room.kind)" class="shrink-0 text-primary" aria-hidden="true" />
              <span class="min-w-0 flex-1 truncate text-label">{{ activeRoomLabel(room) }}</span>
              <span class="shrink-0 text-muted text-supporting">{{ room.participants }}</span>
            </Button>
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
                v-if="node.data?.typeId"
                class="group flex min-w-0 flex-1 items-center gap-2"
                :data-home-type-id="node.data.typeId"
              >
                <i :class="node.icon" class="shrink-0 text-muted" aria-hidden="true" />
                <span class="min-w-0 flex-1 truncate text-label">{{ node.label }}</span>
                <Button
                  v-if="node.data.section && collectionActions(node.data.section.region).length"
                  icon="pi pi-ellipsis-v"
                  text
                  rounded
                  size="small"
                  severity="secondary"
                  class="shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  :aria-label="$t('common.add')"
                  @click.stop="toggleSectionActions($event, node)"
                />
              </span>
              <!-- Row hierarchy: entity rows read as muted until opened; the
                   row open in the active pane carries the normal text color,
                   and row action affordances reveal on hover. -->
              <span
                v-else
                class="group flex min-w-0 flex-1 items-center gap-1"
                :class="node.data?.item?.key !== activePane?.selectionKey ? 'text-muted' : ''"
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
                  :type-id="node.data.item.type"
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
                  class="shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
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
              :action-entries="actionEntriesForPane(pane)"
              :closeable="paneCount > 1"
              @execute-action="executeWorkspaceAction"
              @open-entity="request => openWorkspaceEntity(request.typeId, request.entity)"
              @open-page="openWorkspacePage"
              @open-call="request => openCallTab(request.room, request)"
              @refresh="$emit('refresh')"
              @select-tab="key => selectPaneTab(pane.id, key)"
              @close-tab="key => closePaneTab(pane.id, key)"
              @add-tab="openEmptyPaneTab(pane.id)"
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

    <Menu ref="actionsMenu" :model="rowActionMenuItems" :popup="true">
      <template #item="{ item }">
        <GeneratedActionButton
          :action-id="item.actionId"
          menu-item
          @execute="runRowAction"
        />
      </template>
    </Menu>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue';
import Button from 'primevue/button';
import Avatar from 'primevue/avatar';
import Menu from 'primevue/menu';
import Tree from 'primevue/tree';
import { useI18n } from 'vue-i18n';
import EntityInlineRef from '~/components/shared/EntityInlineRef.vue';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import UserAccountMenu from '~/components/shared/UserAccountMenu.vue';
import CommunicationMenu from '~/components/shared/CommunicationMenu.vue';
import WorkspaceSplitNode from '~/components/shared/WorkspaceSplitNode.vue';
import GeneratedActionButton from '~/components/generated/GeneratedActionButton.vue';
import { consumePendingWorkspaceEntity, workspaceEntityOpenEvent } from '~/utils/entity-workspace-open.js';
import { consumePendingWorkspaceChat, workspaceChatOpenEvent } from '~/utils/chat-workspace-open.js';
import GeneratedHomeScreen from '~/components/generated/GeneratedHomeScreen.vue';
import GeneratedWorkspacePane from '~/components/generated/GeneratedWorkspacePane.vue';
import { actionAppliesToEntity, isCreateAction, isGeneratedSurfaceAction, isRelationLinkAction } from '~/components/generated/action-visibility.js';
import { mergeCollectionActionContext } from '~/components/generated/action-context.js';
import { resolveGeneratedWorkspacePage, generatedWorkspacePages } from '~/components/generated/workspace-pages.js';
import { generatedDetailScreenForTypeId } from '~/components/generated/detail-screen-actions.js';
import { detailRouteForEntity } from '~/components/generated/entity-detail-routing.js';
import { useAuthStore } from '~/stores/auth';
import { useInstancesStore } from '~/stores/instances';
import { useRegistryStore } from '~/stores/registry';
import { useSupportChatStore } from '~/stores/supportChat';
import { useCallsStore } from '~/stores/calls';
import { useEffectiveContainment } from '~/composables/useEffectiveContainment.js';
import { generatedActionLabel } from '~/utils/generated-labels.js';
import { callRoomIcon, callRoomLabel, conversationKeyForRoom } from '~/utils/call-rooms.js';
import { shouldRenderHomeSection } from '~/utils/generated-screen-source.js';
import { linkedExplorerChildSources } from '~/utils/project-linked-child-sources.js';
import { resolveEntityRelationRefs } from '~/utils/entity-relations.js';
import { containmentParent, normalizeHierarchyType } from '~/utils/entity-hierarchy.js';
import { emptyTabItem, emptyTabKey, isEmptyTabKey } from '~/utils/workspace-empty-tabs.js';
import {
  closeWorkspaceLeaf,
  createWorkspaceLeaf,
  splitWorkspaceLeaf,
  updateWorkspaceLeaf,
  updateWorkspaceSplit,
  withPaneTab,
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
const instances = useInstancesStore();
const registryStore = useRegistryStore();
const supportChatStore = useSupportChatStore();
const callsStore = useCallsStore();
const effectiveContainment = useEffectiveContainment();
const { t, te } = useI18n();
const activePaneId = ref('pane-1');
const paneSequence = ref(1);
const paneTree = ref(createWorkspaceLeaf('pane-1'));
const selectionKeys = ref({});
const expandedKeys = ref({});
const openedEntityRefs = ref([]);
const openedPageRefs = ref([]);
const openedScreenRefs = ref([]);
const openedEntityItems = ref([]);
const hydratedStorageKey = ref('');
const actionsMenu = ref(null);
const rowActionEntries = ref([]);
const rowActionMenuItems = computed(() => rowActionEntries.value.map(entry => ({
  actionId: entry.action.id,
  label: generatedActionLabel(entry.action, entry.action.id, { t, te })
})));
const linkedChildrenByKey = ref(new Map());
const loadedChildKeys = ref(new Set());
let openedEntityLoadSequence = 0;
let childLoadSequences = new Map();
// Layout-only passthroughs: dense rows (matching the project workspace
// Explorer), full-width hover/selection with the indent carried inside the
// row content, and a label that owns the remaining width for end-aligned
// row controls.
const explorerTreePt = {
  nodeChildren: { style: { paddingInlineStart: '0' } },
  nodeContent: ({ props }) => ({
    style: { paddingInlineStart: `${(Math.max(props.level || 1, 1) - 1) * 0.75}rem` }
  }),
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
  .filter(section => section.source.typeId && shouldRenderHomeSection(section)));

const sectionItems = computed(() => sections.value.flatMap(section => section.items
  .filter(entity => entityId(entity))
  .map(entity => workspaceEntityItem(section.source.typeId, entity))));
const workspaceEntityItems = computed(() => [...sectionItems.value, ...openedEntityItems.value]
  .filter((item, index, items) => items.findIndex(candidate => candidate.key === item.key) === index));
const cassetteItems = computed(() => workspaceEntityItems.value.filter(item => item.type === 'cassette'));
const openedPageItems = computed(() => openedPageRefs.value.map(reference => {
  const entityItem = workspaceEntityItems.value.find(item => (
    item.type === reference.typeId
    && entityId(item.entity) === reference.entityId
  ));
  if (!entityItem) return null;
  return {
    key: reference.key,
    kind: 'page',
    pageId: reference.pageId,
    entity: entityItem.entity,
    typeId: reference.typeId,
    cassettes: cassetteItems.value.map(item => item.entity)
  };
}).filter(Boolean));
// Opened type screens: sidebar type nodes opened as pane tabs. Labels and
// icons resolve live from the manifest/registry, so a recompiled process
// updates open tabs without persisted stale text.
const screenItems = computed(() => openedScreenRefs.value.map(reference => ({
  key: reference.key,
  kind: 'screen',
  screenKey: reference.screenKey,
  typeId: reference.typeId || '',
  label: screenLabelFor(reference.screenKey)
})));
// Registered pages without an entity binding are always openable tabs.
const staticPageItems = computed(() => generatedWorkspacePages
  .filter(page => !page.typeId && !page.ephemeral)
  .map(page => ({ key: `page:${page.id}`, kind: 'page', pageId: page.id })));
const callPageItems = computed(() => callPageRefs.value.map(call => ({
  key: call.key,
  kind: 'page',
  pageId: 'call',
  room: call.room,
  conversationKey: call.conversationKey,
  label: call.label
})));
const chatPageItems = computed(() => chatPageRefs.value.map(chat => ({
  key: chat.key,
  kind: 'page',
  pageId: 'chats',
  conversationKey: chat.conversationKey,
  label: chat.label
})));
const workspaceItems = computed(() => [
  ...workspaceEntityItems.value,
  ...screenItems.value,
  ...openedPageItems.value,
  ...callPageItems.value,
  ...chatPageItems.value,
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
const currentUserId = computed(() => String(
  authStore.userData?.id || authStore.userData?.userId || authStore.userData?._id || ''
));

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

// The explorer tree is the TYPE hierarchy from the render contracts: the
// registry bundle's declared containment (children edges) nests types under
// their parents, manifest-backed types (their ancestors included for
// structure) render as nodes, and type instances hang beneath them from
// the home sections. Root types — authored classes and groups — are
// selectable: their compiled typeList screen opens in the active pane.

const screenfulTypes = computed(() => new Set((authStore.screenManifest || [])
  .filter(screen => screen.typeId && screen.template === 'typeList')
  .map(screen => screen.typeId)));

// Types worth rendering: every screen-backed type plus its containment
// ancestors (structural nodes keep the hierarchy real).
const visibleTypes = computed(() => {
  const parentOf = new Map(effectiveContainment().map(triple => [triple.childType, triple.parentType]));
  const visible = new Set();
  for (const typeId of screenfulTypes.value) {
    let cursor = typeId;
    const guard = new Set();
    while (cursor && !guard.has(cursor) && registryStore.typeRecord(cursor)) {
      guard.add(cursor);
      visible.add(cursor);
      cursor = parentOf.get(cursor) || '';
    }
  }
  return visible;
});

const explorerNodes = computed(() => {
  const childTypes = new Map();
  for (const triple of effectiveContainment()) {
    if (!visibleTypes.value.has(triple.childType) || !visibleTypes.value.has(triple.parentType)) continue;
    const list = childTypes.get(triple.parentType) || [];
    if (!list.includes(triple.childType)) list.push(triple.childType);
    childTypes.set(triple.parentType, list);
  }
  const rooted = new Set(childTypes.values().flatMap(list => list));
  const roots = [...visibleTypes.value].filter(typeId => !rooted.has(typeId));
  return roots
    .map(typeId => typeNode(typeId, childTypes))
    .sort((a, b) => a.label.localeCompare(b.label));
});

function typeNode(typeId, childTypes) {
  const children = (childTypes.get(typeId) || [])
    .map(child => typeNode(child, childTypes))
    .sort((a, b) => a.label.localeCompare(b.label));
  const section = sections.value.find(candidate => candidate.source.typeId === typeId);
  const entities = section ? sectionItemsFor(section.region.id) : [];
  const screen = typeScreenFor(typeId);
  return {
    key: typeMenuKey(typeId),
    label: typeLabelOf(typeId),
    icon: instances.iconFor(typeId),
    selectable: true,
    data: { typeId, screen, section },
    leaf: !children.length && !entities.length,
    children: [...children, ...entities.map(item => entityNode(item))]
  };
}

function typeMenuKey(typeId = '') {
  return `type:${typeId}`;
}

function typeLabelOf(typeId = '') {
  return registryStore.typeRecord(typeId)?.render?.label || typeId;
}

// The screen a type node opens: its compiled typeList screen.
function typeScreenFor(typeId = '') {
  return (authStore.screenManifest || []).find(screen => (
    screen.typeId === typeId && screen.template === 'typeList'
  )) || null;
}

function screenLabelFor(screenKey = '') {
  const screen = (authStore.screenManifest || []).find(candidate => (
    candidate.screenKey === screenKey || candidate.id === screenKey
  ));
  return screen?.label || screen?.typeId || screenKey;
}

// A type (or its screen) opens as a pane tab in the active pane — never a
// separate route.
function openTypeScreen(screen = null) {
  if (!screen?.screenKey && !screen?.id) return;
  const screenKey = screen.screenKey || screen.id;
  const key = `screen:${screenKey}`;
  if (!openedScreenRefs.value.some(reference => reference.key === key)) {
    openedScreenRefs.value = [...openedScreenRefs.value, {
      key,
      screenKey,
      typeId: screen.typeId || ''
    }];
  }
  if (activePane.value) selectPaneTab(activePane.value.id, key);
}

watch(explorerNodes, value => {
  const next = { ...expandedKeys.value };
  for (const node of value) {
    if (!(node.key in next)) next[node.key] = true;
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
  openedScreenRefs.value = state.openedScreenRefs || [];
  hydratedStorageKey.value = key;
  syncActiveSelection();
}, { immediate: true });

watch(
  [paneTree, activePaneId, paneSequence, openedEntityRefs, openedPageRefs, openedScreenRefs],
  () => {
    const key = workspaceStorageKey.value;
    if (!key || hydratedStorageKey.value !== key || typeof window === 'undefined') return;
    saveHomeWorkspaceState(window.localStorage, key, {
      paneTree: paneTree.value,
      activePaneId: activePaneId.value,
      paneSequence: paneSequence.value,
      openedEntityRefs: openedEntityRefs.value,
      openedPageRefs: openedPageRefs.value,
      openedScreenRefs: openedScreenRefs.value
    });
  },
  { deep: true }
);

watch(openedEntityRefs, async refs => {
  const sequence = ++openedEntityLoadSequence;
  const loaded = await Promise.all(refs.map(async reference => {
    const existing = workspaceEntityItems.value.find(item => (
      item.type === reference.typeId && entityId(item.entity) === reference.entityId
    ));
    const entity = existing?.entity
      || await instances.resolveReadableReference(instances.canonicalTypeKey(reference.typeId), reference.entityId, { silent: true });
    return entity ? workspaceEntityItem(reference.typeId, entity) : null;
  }));
  if (sequence !== openedEntityLoadSequence) return;
  openedEntityItems.value = loaded.filter(Boolean);
}, { immediate: true, deep: true });

// Active-call state comes from the shared calls store (snapshot +
// `call.activity`/`call.invite` subscriptions owned by the app shell), so the
// sidebar, chats, and the floating invite notifications all agree without
// per-surface polling.
watch(() => [
  authStore.userIsSet,
  authStore.organizationData?._id || authStore.userData?.organizationId,
  currentUserId.value
], () => {
  if (authStore.userIsSet) callsStore.connect();
}, { immediate: true });

// Accepted invites and docked floating calls open here as workspace tabs:
// the call machine parks a pending tab room and any surface routing to the
// home workspace navigates here to consume it.
watch(() => callsStore.pendingTabRoom, room => {
  if (!room) return;
  openCallTab(room, { conversationKey: conversationKeyForRoom(room) });
  callsStore.consumePendingTabRoom();
}, { immediate: true });

// Desktop entity links open as workspace tabs: live events while the home
// workspace is mounted, pending requests (stashed before navigating home)
// consumed on mount.
function openRequestedWorkspaceEntity(event) {
  event?.preventDefault?.();
  const { typeId, entityId } = event?.detail || {};
  if (!typeId || !entityId) return;
  openWorkspaceEntity(typeId, { _id: entityId });
}

onMounted(() => {
  window.addEventListener(workspaceEntityOpenEvent, openRequestedWorkspaceEntity);
  const pending = consumePendingWorkspaceEntity();
  if (pending?.typeId) openRequestedWorkspaceEntity({ detail: pending });
  window.addEventListener(workspaceChatOpenEvent, openRequestedWorkspaceChat);
  const pendingChat = consumePendingWorkspaceChat();
  if (pendingChat) openRequestedWorkspaceChat({ detail: pendingChat });
});

onBeforeUnmount(() => {
  window.removeEventListener(workspaceEntityOpenEvent, openRequestedWorkspaceEntity);
  window.removeEventListener(workspaceChatOpenEvent, openRequestedWorkspaceChat);
});

watch([activePaneId, paneTree], syncActiveSelection);

function activeRoomLabel(room = {}) {
  return callRoomLabel(room.room, supportChatStore.conversations, {
    userId: currentUserId.value,
    orgName: authStore.organizationData?.identity?.name
      || authStore.organizationData?.data?.name
      || undefined,
    fallback: t('call.activeRoom')
  });
}

// Calls open as ephemeral workspace tabs (never persisted with the pane
// layout): the tab hosts the LiveKit stage plus the conversation chat rail.
const callPageRefs = ref([]);

// Pinned chat tabs are ephemeral like calls: the desktop "expand" action
// opens one conversation as its own chats tab.
const chatPageRefs = ref([]);

function openChatTab(conversationKey = '', label = '') {
  if (!activePane.value) return;
  const key = conversationKey ? `page:chat:${conversationKey}` : 'page:chats';
  const existing = chatPageRefs.value.find(chat => chat.key === key);
  if (existing) {
    if (label && existing.label !== label) existing.label = label;
  } else {
    chatPageRefs.value = [...chatPageRefs.value, {
      key,
      conversationKey,
      label
    }];
  }
  selectPaneTab(activePane.value.id, key, { newTab: true });
}

function openRequestedWorkspaceChat(event) {
  event?.preventDefault?.();
  const { conversationKey, label } = event?.detail || {};
  openChatTab(conversationKey || '', typeof label === 'string' ? label : '');
}

function openCallTab(room = '', meta = {}) {
  if (!room || !activePane.value) return;
  const label = typeof meta.label === 'string' ? meta.label : '';
  const existing = callPageRefs.value.find(call => call.key === room);
  if (existing) {
    if (label && existing.label !== label) existing.label = label;
  } else {
    callPageRefs.value = [...callPageRefs.value, {
      key: room,
      room,
      conversationKey: meta.conversationKey || '',
      label
    }];
  }
  // Live call stages own their tab: navigating the workspace must not
  // unmount an active call, so calls always open as a new tab.
  selectPaneTab(activePane.value.id, room, { newTab: true });
}

async function startCallFromConversation(conversation = {}) {
  if (!conversation.conversationKey) return;
  // Label comes from the conversation summary the menu emitted; empty falls
  // back to the call page's own title in the tab strip.
  const label = conversation.conversationKind === 'group'
    ? (conversation.groupName || '')
    : (conversation?.participant?.identity?.name || '');
  try {
    const invite = await $fetch('/api/livekit/invite', {
      method: 'POST',
      body: { conversationKey: conversation.conversationKey }
    });
    openCallTab(invite.room, {
      conversationKey: conversation.conversationKey,
      label
    });
  } catch (error) {
    console.error('Failed to start call:', error);
  }
}

function openChatsPage() {
  if (activePane.value) selectPaneTab(activePane.value.id, 'page:chats');
}

function toggleSectionActions(event, node) {
  const section = node.data?.section;
  if (!section) return;
  rowActionEntries.value = collectionActions(section.region)
    .map(action => ({ action, context: actionContext(section) }));
  actionsMenu.value?.toggle(event);
}

function toggleChildActions(event, node) {
  const item = node.data?.item;
  if (!item) return;
  rowActionEntries.value = rowActions(item);
  actionsMenu.value?.toggle(event);
}

function hideRowActions() {
  actionsMenu.value?.hide();
}

function runRowAction(action) {
  const entry = rowActionEntries.value.find(item => item.action.id === (action?.id || action?.id));
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
    .filter(isCreateAction);
}

function resolvedRegionActions(region = {}) {
  return [...new Map((region.actions || [])
    .map(actionId => authStore.actionManifest.find(action => action.id === actionId))
    .filter(Boolean)
    .map(action => [action.id, action])).values()];
}

// Child creates for an explorer entity come from that entity type's compiled
// detail screen: every list region below the single main source contributes
// its createEntity actions with the row entity bound as the opened parent.
function linkActions(item = null) {
  const detailScreen = generatedDetailScreenForTypeId({
    screens: authStore.screenManifest,
    typeId: item.type
  });
  if (!detailScreen) return [];
  const mainRegion = (detailScreen.regions || []).find(region => (
    (detailScreen.sources || []).some(source => (
      source.id === region.sourceId
      && source.typeId === item.type
      && source.mode === 'single'
    ))
  ));
  const actionIds = [...new Set([...(mainRegion?.actions || []), ...(detailScreen.actions || [])])];
  return resolvedRegionActions({ actions: actionIds })
    .filter(isRelationLinkAction)
    .filter(isGeneratedSurfaceAction)
    .map(action => ({
      action,
      entity: item.entity,
      context: {
        parentEntity: item.entity,
        parentTypeId: item.type
      }
    }));
}

function childCreateActions(item = null) {
  if (!item?.entity) return [];
  const detailScreen = generatedDetailScreenForTypeId({
    screens: authStore.screenManifest,
    typeId: item.type
  });
  if (!detailScreen) return [];
  const entries = [];
  for (const region of detailScreen.regions || []) {
    const source = (detailScreen.sources || []).find(candidate => candidate.id === region.sourceId);
    if (!source || source.mode !== 'list' || source.typeId === item.type) continue;
    for (const action of resolvedRegionActions(region).filter(isCreateAction)) {
      entries.push({
        action,
        context: mergeCollectionActionContext({
          incoming: {
            parentTypeId: item.type,
            parentEntity: item.entity,
            parentEntityId: entityId(item.entity)
          },
          region,
          source,
          typeId: source.typeId,
          items: []
        })
      });
    }
  }
  return entries.filter((entry, index, list) => (
    list.findIndex(candidate => candidate.action.id === entry.action.id) === index
  ));
}

function actionContext(section = {}) {
  return {
    region: section.region,
    source: section.source,
    typeId: section.source.typeId,
    parentTypeId: section.source.typeId,
    parentOptions: section.items.map(entity => ({
      label: entity.identity?.name || entity.identity?.uid || entity._id,
      value: entity._id || entity.identity?.uid,
      entity
    }))
  };
}

function sectionItemsFor(regionId) {
  const section = sections.value.find(candidate => candidate.region.id === regionId);
  return section ? sectionItems.value.filter(item => (
    item.type === section.source.typeId
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
  if (node.data?.typeId) {
    openTypeScreen(node.data.screen);
    return;
  }
  const item = node.data?.item;
  if (!item) return;
  // Sidebar rows are contract-generated destinations: the compiled detail
  // screen for the row's type is the canonical instance surface, so the
  // click routes there. With no paired detail screen the row keeps its
  // workspace-pane behavior (selected in the open pane, dead when none).
  const route = detailRouteForEntity({
    entity: item.entity,
    typeId: item.type,
    manifest: authStore.screenManifest
  });
  if (route) {
    navigateTo(route);
    return;
  }
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
      const entities = await instances.listInstances(instances.canonicalTypeKey(source.typeId), source.filters);
      return (Array.isArray(entities) ? entities : []).map(entity => workspaceEntityItem(source.typeId, entity));
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
      entity = await instances.resolveReadableReference(instances.canonicalTypeKey(parent.type), entityId(entity), { silent: true }) || entity;
    } catch {
      entity = entity;
    }
  }
  const refs = relationRefsFor(entity);
  const loaded = await Promise.all(refs.map(async ref => {
    const existing = workspaceEntityItems.value.find(item => (
      item.type === ref.typeId && entityId(item.entity) === ref.id
    ));
    const resolved = existing?.entity
      || ref.entity
      || await instances.resolveReadableReference(instances.canonicalTypeKey(ref.typeId), ref.id, { silent: true }).catch(() => null);
    return resolved ? workspaceEntityItem(ref.typeId, resolved) : null;
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

function selectPaneTab(paneId, key, options = {}) {
  const pane = panes.value.find(item => item.id === paneId);
  if (!pane) return;
  if (!isEmptyTabKey(key) && !workspaceItems.value.some(item => item.key === key)) return;
  paneTree.value = updateWorkspaceLeaf(paneTree.value, paneId, {
    selectionKey: key,
    tabKeys: withPaneTab(pane, key, options)
  });
  activePaneId.value = paneId;
  syncActiveSelection();
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
  const selectionKey = pane.selectionKey === key
    ? (tabKeys[Math.max(0, closingIndex - 1)] || '')
    : pane.selectionKey;
  const nextTree = updateWorkspaceLeaf(paneTree.value, paneId, { selectionKey, tabKeys });
  paneTree.value = nextTree;
  const remainingTabKeys = new Set(workspaceLeaves(nextTree).flatMap(leaf => leaf.tabKeys || []));
  if (!remainingTabKeys.has(key)) {
    openedPageRefs.value = openedPageRefs.value.filter(reference => reference.key !== key);
    openedScreenRefs.value = openedScreenRefs.value.filter(reference => reference.key !== key);
    callPageRefs.value = callPageRefs.value.filter(call => call.key !== key);
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

function openWorkspaceEntity(typeId, entity) {
  const item = rememberWorkspaceEntity(typeId, entity);
  if (!item || !activePane.value) return;
  selectPaneTab(activePane.value.id, item.key);
}

function openWorkspacePage(request = {}) {
  const definition = resolveGeneratedWorkspacePage(request.pageId);
  if (!definition) return;
  if (!definition.typeId) {
    if (activePane.value) selectPaneTab(activePane.value.id, `page:${definition.id}`);
    return;
  }
  if (definition.typeId !== request.typeId) return;

  rememberWorkspaceEntity(request.typeId, request.entity);

  const entityItem = workspaceEntityItems.value.find(item => (
    item.type === definition.typeId
    && entityId(item.entity) === entityId(request.entity)
  ));
  if (!entityItem || !activePane.value) return;

  const key = workspacePageKey(definition.id, entityItem.entity);
  if (!openedPageRefs.value.some(page => page.key === key)) {
    openedPageRefs.value = [...openedPageRefs.value, {
      key,
      pageId: definition.id,
      typeId: definition.typeId,
      entityId: entityId(entityItem.entity)
    }];
  }
  selectPaneTab(activePane.value.id, key);
}

function rememberWorkspaceEntity(typeId, entity) {
  const id = entityId(entity);
  if (!typeId || !id) return null;
  const key = entityKey(typeId, entity);
  const existing = workspaceEntityItems.value.find(item => item.key === key);
  if (existing) return existing;

  const item = workspaceEntityItem(typeId, entity);
  openedEntityItems.value = [...openedEntityItems.value, item];
  if (!openedEntityRefs.value.some(reference => reference.key === key)) {
    openedEntityRefs.value = [...openedEntityRefs.value, {
      key,
      typeId,
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
    .map(actionId => authStore.actionManifest.find(action => action.id === actionId))
    .filter(Boolean)
    .filter(isGeneratedSurfaceAction)
    .filter(action => actionAppliesToEntity(action, item.entity, item.type))
    .map(action => ({
      key: `${item.key}:${action.id}`,
      actionId: action.id,
      entity: item.entity,
      item,
      context
    }));
}

function contextForItem(item = null) {
  return {
    typeId: item?.type || '',
    parentTypeId: item?.type || ''
  };
}

function itemForPane(pane) {
  return workspaceItems.value.find(item => item.key === pane?.selectionKey)
    || null;
}

function tabItemsForPane(pane) {
  return (pane?.tabKeys || [])
    .map(key => workspaceItems.value.find(item => item.key === key) || emptyTabItem(key));
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
    candidate.source.typeId === type
    && candidate.items.some(item => entityId(item) === entityId(entity))
  ));
  return section?.region || null;
}

function entityId(entity = null) {
  const value = entity?._id || entity?.identity?.uid || '';
  return value ? String(value) : '';
}
</script>

