<template>
  <div class="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
    <div class="hidden h-full min-h-0 flex-1 overflow-hidden md:flex" data-home-workspace>
      <aside
        :class="['flex min-w-0 shrink-0 flex-col transition-[width] duration-200', sidebarCollapsed ? 'w-14' : 'w-64']"
        :aria-label="$t('nav.home')"
      >
        <!-- Brand panel owns the wrap control: the wordmark shrinks to the
             mark and the toggle flips with it. -->
        <header
          :class="['flex shrink-0 items-center', sidebarCollapsed ? 'flex-col gap-1 px-1.5 py-2' : 'h-12 justify-between px-3']"
        >
          <NuxtLink to="/" class="flex items-center no-underline" aria-label="Perigram">
            <template v-if="!sidebarCollapsed">
              <img src="/logo-light.svg" alt="Perigram" class="h-7 w-auto dark:hidden" />
              <img src="/logo-dark.svg" alt="Perigram" class="hidden h-7 w-auto dark:block" />
            </template>
            <img v-else src="/icon.svg" alt="Perigram" class="h-7 w-7" />
          </NuxtLink>
          <Button
            :icon="sidebarCollapsed ? 'pi pi-chevron-right' : 'pi pi-chevron-left'"
            text
            rounded
            size="small"
            severity="secondary"
            :aria-label="sidebarCollapsed ? $t('nav.expandSidebar') : $t('nav.collapseSidebar')"
            @click="toggleSidebarCollapsed"
          />
        </header>

        <!-- Wrapped rail: communication first (chats, calls — the same
             order the expanded menu leads with), then one icon per
             top-level panel; the brand mark, profile avatar, and this rail
             are the whole sidebar. -->
        <nav
          v-if="sidebarCollapsed"
          class="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto p-1.5"
          :aria-label="$t('nav.home')"
        >
          <Button
            icon="pi pi-comments"
            text
            rounded
            size="small"
            severity="secondary"
            :aria-label="$t('support.chatTitle')"
            :title="$t('support.chatTitle')"
            @click="openChatsPage"
          />
          <Button
            icon="pi pi-phone"
            text
            rounded
            size="small"
            severity="secondary"
            :aria-label="$t('call.calls')"
            :title="$t('call.calls')"
            @click="event => callsFlyout?.toggle(event)"
          />
          <Button
            v-for="node in explorerNodes"
            :key="node.key"
            :icon="node.icon"
            text
            rounded
            size="small"
            severity="secondary"
            :aria-label="node.label"
            :title="node.label"
            @click="openTypeScreen(node.data.screen)"
          />
        </nav>

        <!-- Expanded navigation is one raw PanelMenu: two communication
             entries first — Chats opens the chats page; Calls toggles its
             suggestions flyout and carries active call rooms as rows only
             while calls run — then one panel per top-level explorer
             type. Default rows carry the registry icons and
             title-resolver labels. The capture click handler splits header
             and row clicks from collapse toggling (chevron-only). -->
        <div v-else class="min-h-0 flex-1 overflow-y-auto p-1.5">
          <PanelMenu
            v-model:expanded-keys="expandedKeys"
            :model="sidebarMenuModel"
            multiple
            class="w-full"
            :aria-label="$t('nav.home')"
            :pt="menuPt"
            @click.capture="onMenuClickCapture"
          />
        </div>

        <!-- The Calls flyout is anchored at whichever entry toggled it
             (expanded row or wrapped icon) and lives outside the two
             sidebar branches so the wrapped rail reaches it too. -->
        <CommunicationMenu ref="callsFlyout" @start-call="startCallFromConversation" />


        <!-- Profile is its own bottom panel: the account trigger shows the
             user's actual name in the unwrapped state, the avatar alone in
             the wrapped rail. -->
        <footer :class="['shrink-0', sidebarCollapsed ? 'p-1.5' : 'p-2']">
          <UserAccountMenu class="block">
            <template #trigger="{ toggle }">
              <button
                type="button"
                data-testid="user-menu-trigger"
                :class="['flex w-full items-center rounded-ui border border-chrome-border border-round text-left transition-colors hover:bg-content', sidebarCollapsed ? 'justify-center p-1' : 'gap-2 p-1.5']"
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
                <template v-if="!sidebarCollapsed">
                  <span class="m-0 flex min-w-0 flex-1 flex-col">
                    <span class="truncate text-label">
                      {{ authStore.userData.name || $t('common.user') }}
                    </span>
                    <span v-if="activeOrganizationLabel" class="truncate text-supporting text-muted">
                      {{ activeOrganizationLabel }}
                    </span>
                  </span>
                  <i class="pi pi-chevron-up shrink-0 text-muted" aria-hidden="true" />
                </template>
              </button>
            </template>
          </UserAccountMenu>
        </footer>
      </aside>

      <div class="min-h-0 min-w-0 flex-1 overflow-hidden p-1.5">
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
              :closeable="paneCount > 1"
              @execute-action="executeWorkspaceAction"
              @open-entity="request => openWorkspaceEntity(request.typeId, { _id: request.instanceId })"
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

    <!-- Mobile home renders the screen selected in the app-shell bottom
         bar — the shared mobile home tab state over the sidebar tree's
         root types (chats is the bar's own route tab). The typeList
         screen renders through the same CTS render contract as the
         desktop panes; instance opens mount the ITEM POPUP below —
         nothing routes away from the shell on mobile. -->
    <div class="flex h-full min-h-0 flex-1 flex-col overflow-hidden md:hidden" data-home-workspace-mobile>
      <div class="min-h-0 flex-1 overflow-y-auto p-4">
        <GeneratedTypeScreen
          v-if="mobileTypeScreen"
          :key="mobileTypeScreen.screenKey || mobileTypeScreen.id"
          :screen="mobileTypeScreen"
          @open-instance="openMobileInstance"
          @refresh="$emit('refresh')"
        />
        <!-- The default home may carry no type sections (no definition or
             one that no longer compiles): the same open-content prompt the
             desktop panes render keeps mobile home non-empty. -->
        <div v-else class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-muted">
          <i class="pi pi-folder-open" aria-hidden="true" />
          <span>{{ $t('project.openSomething') }}</span>
        </div>
      </div>
    </div>


  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue';
import Button from 'primevue/button';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import GeneratedDetailScreen from '~/components/generated/GeneratedDetailScreen.vue';
import Avatar from 'primevue/avatar';
import PanelMenu from 'primevue/panelmenu';
import { useI18n } from 'vue-i18n';
import UserAccountMenu from '~/components/shared/UserAccountMenu.vue';
import WorkspaceSplitNode from '~/components/shared/WorkspaceSplitNode.vue';
import CommunicationMenu from '~/components/shared/CommunicationMenu.vue';
import { consumePendingWorkspaceInstance, workspaceInstanceOpenEvent } from '~/utils/instance-workspace-open.js';
import { consumePendingWorkspaceChat, workspaceChatOpenEvent } from '~/utils/chat-workspace-open.js';
import { consumePendingWorkspacePage, workspacePageOpenEvent } from '~/utils/workspace-page-open.js';
import GeneratedTypeScreen from '~/components/generated/GeneratedTypeScreen.vue';
import GeneratedWorkspacePane from '~/components/generated/GeneratedWorkspacePane.vue';
import DirectoryDetailSurface from '~/components/directory/DirectoryDetailSurface.vue';
import { titleFor, typeLabelKey, localizedLabel } from '#shared/ui-mapping/index.js';
import { dtoToScreenInstance } from '~/utils/instance-shape.js';
import { resolveGeneratedWorkspacePage, generatedWorkspacePages, entityWorkspacePageIdFor } from '~/components/generated/workspace-pages.js';
import { resolveDetailScreen } from '~/components/generated/detail-screen-actions.js';
import { resolveFileSurface } from '~/components/generated/file-surfaces.js';
import { detailRouteForInstance } from '~/components/generated/instance-detail-routing.js';
import { useAuthStore } from '~/stores/auth';
import { useInstancesStore } from '~/stores/instances';
import { useRegistryStore } from '~/stores/registry';
import { useSupportChatStore } from '~/stores/supportChat';
import { useCallsStore } from '~/stores/calls';
import { useEffectiveContainment } from '~/composables/useEffectiveContainment.js';
import { useMobileHomeTabs } from '~/composables/useMobileHomeTabs.js';
import { callRoomIcon, callRoomLabel, conversationKeyForRoom } from '~/utils/call-rooms.js';
import { shouldRenderHomeSection } from '~/utils/generated-screen-source.js';
import { linkedExplorerChildSources } from '~/utils/project-linked-child-sources.js';
import { resolveInstanceRelationRefs } from '~/utils/instance-relations.js';
import { containmentParent, normalizeHierarchyType } from '~/utils/instance-hierarchy.js';
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

// Panes never exist without a tab: fresh panes start on a default empty
// tab, persisted tabless leaves normalize to one at load, and closing
// the last tab closes the pane (the workspace's final pane resets
// instead).
function defaultLeaf(id) {
  return createWorkspaceLeaf(id, emptyTabKey());
}

const paneTree = ref(defaultLeaf('pane-1'));
const sidebarCollapsed = ref(false);
const expandedKeys = ref({});
const callsFlyout = ref(null);
const openedEntityRefs = ref([]);
const openedPageRefs = ref([]);
const openedScreenRefs = ref([]);
const openedEntityItems = ref([]);
const hydratedStorageKey = ref('');
let isWorkspaceMounted = false;
const linkedChildrenByKey = ref(new Map());
const loadedChildKeys = ref(new Set());
let openedEntityLoadSequence = 0;
let childLoadSequences = new Map();
provide('displayedEntityContexts', computed(() => []));

// Layout-only passthrough: panel headers inherit the 1.5 line-height item
// labels dropped, which made top-level entries taller than their rows.
const menuPt = {
  headerLabel: { style: { lineHeight: '1' } }
};

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
  .filter(entity => instanceId(entity))
  .map(entity => workspaceEntityItem(section.source.typeId, entity))));
const workspaceEntityItems = computed(() => [...sectionItems.value, ...openedEntityItems.value]
  .filter((item, index, items) => items.findIndex(candidate => candidate.key === item.key) === index));
const cassetteItems = computed(() => workspaceEntityItems.value.filter(item => item.type === 'cassette'));
const openedPageItems = computed(() => openedPageRefs.value.map(reference => {
  const entityItem = workspaceEntityItems.value.find(item => (
    item.type === reference.typeId
    && instanceId(item.entity) === reference.instanceId
  ));
  if (!entityItem) return null;
  return {
    key: reference.key,
    kind: 'page',
    pageId: reference.pageId,
    entity: entityItem.entity,
    typeId: reference.typeId,
    // Entity-bound page tabs label from the one title resolver like
    // instance tabs — the page id stays a fallback, not the display.
    label: instanceLabelOf(reference.typeId, reference.instanceId),
    cassettes: cassetteItems.value.map(item => item.entity)
  };
}).filter(Boolean));
// Opened screens as pane tabs. Type screens keep their manifest label;
// instance-bound detail tabs label from the one title resolver
// (titleFor over the pool DTO), so the declared identity field
// wins and raw ids never render. Labels and icons resolve live from the
// manifest/registry/pool, so a recompiled process updates open tabs
// without persisted stale text.
const screenItems = computed(() => openedScreenRefs.value.map(reference => {
  const base = {
    key: reference.key,
    kind: 'screen',
    screenKey: reference.screenKey,
    typeId: reference.typeId || '',
    instanceId: reference.instanceId || ''
  };
  return reference.instanceId
    ? { ...base, label: instanceLabelOf(reference.typeId, reference.instanceId) }
    : { ...base, label: screenLabelFor(reference.screenKey) };
}));

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
// containment graph: lazily fetched explorer children and instances opened
// from nested surfaces both nest beneath their loaded ancestor.
const childrenByKey = computed(() => {
  const containment = effectiveContainment();
  const byIdentity = new Map(workspaceEntityItems.value.map(item => [
    `${normalizeHierarchyType(item.type)}:${instanceId(item.entity)}`,
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

// The PanelMenu model is the explorer tree plus the communication
// panel: type nodes become panels (their registry icon is PanelMenu's
// item icon), entity nodes become rows carrying the workspace item for
// the #item slot.
// The explorer model is the two communication entries plus the pure
// type hierarchy: type nodes become panels (their registry icon is
// PanelMenu's item icon), entity nodes become rows carrying the
// workspace item for the #item slot.
const sidebarMenuModel = computed(() => [
  ...communicationPanelModels(),
  ...explorerNodes.value.map(node => typePanelItem(node))
]);

// Menu selection follows the active pane's selected tab: a type screen
// selects its type panel, an instance/detail/page tab selects its entity
// row plus the owning type panel, and the chats page selects Chats. Every
// other entry renders muted (per-item classes through PanelMenu's official
// `headerClass`/`class` item channels — default rendering untouched).
const selectedMenuKeys = computed(() => {
  const item = workspaceItems.value.find(candidate => candidate.key === activePane.value?.selectionKey)
    || null;
  if (!item) return new Set();
  const keys = new Set();
  const typeId = item.typeId || item.type || null;
  if (item.kind === 'screen' && !item.instanceId && typeId) {
    keys.add(typeMenuKey(typeId));
  } else if (item.kind === 'page' && item.pageId === 'chats') {
    keys.add('communication:chats');
  } else if (typeId) {
    const instanceIdValue = item.instanceId || instanceId(item.entity);
    if (instanceIdValue) keys.add(`${typeId}:${instanceIdValue}`);
    keys.add(typeMenuKey(typeId));
  }
  return keys;
});

// Click/collapse split: a header or nested-group row click opens its
// content WITHOUT toggling the panel; the submenu chevron toggles WITHOUT
// running the open command. Leaf rows keep the default behavior (their
// whole click is the command). The split rides one capture-phase handler
// plus a command guard — PrimeVue's onHeaderClick runs command and toggle
// together, so non-chevron clicks stop propagation here and invoke the
// open command directly, while chevron clicks let the default handler run
// with the command suppressed once.
const menuOpenTargets = new Map();
const suppressNextMenuCommand = ref(false);

function menuCommand(key, open) {
  menuOpenTargets.set(key, open);
  return (...args) => {
    if (suppressNextMenuCommand.value) {
      suppressNextMenuCommand.value = false;
      return;
    }
    open(...args);
  };
}

function menuKeyForElement(element) {
  // PanelMenu renders item ids from positional index paths, never from
  // model keys, so the split resolves the clicked entry by POSITION: the
  // panel's index among the root's panels, then each row's li index up
  // the submenu nesting, walked against the sidebar model.
  const root = element.closest('.p-panelmenu');
  const panel = element.closest('.p-panelmenu-panel');
  if (!root || !panel) return null;
  const panels = [...root.querySelectorAll(':scope > .p-panelmenu-panel')];
  const panelIndex = panels.indexOf(panel);
  if (panelIndex < 0) return null;
  let node = sidebarMenuModel.value[panelIndex];
  if (!node) return null;
  if (element.classList.contains('p-panelmenu-header')) return node.key || null;
  const indices = [];
  let row = element.closest('li');
  while (row && row !== panel && indices.length < 32) {
    const siblings = [...(row.parentElement?.children || [])].filter(child => child.tagName === 'LI');
    indices.unshift(siblings.indexOf(row));
    row = row.parentElement?.closest('li') || null;
  }
  for (const index of indices) {
    if (index < 0 || !node?.items?.length) return null;
    node = node.items[index];
  }
  return node?.key || null;
}

function onMenuClickCapture(event) {
  // Pointer clicks blur whatever PrimeVue focuses inside the menu after
  // its handlers run: the list's focus-tracked item (`data-p-focused`,
  // driven by mousemove while the list holds focus) otherwise keeps the
  // last hovered row highlighted after the cursor leaves. Keyboard
  // activation (click detail 0) keeps PrimeVue's focus model intact.
  if (event.detail > 0 && typeof document !== 'undefined') {
    setTimeout(() => {
      const active = document.activeElement;
      if (active && typeof active.blur === 'function' && active.closest('.p-panelmenu')) active.blur();
    }, 0);
  }
  const onChevron = Boolean(event.target.closest('.p-panelmenu-submenu-icon'));
  const header = event.target.closest('.p-panelmenu-header');
  const row = event.target.closest('.p-panelmenu-item');
  const element = header || row;
  if (!element) return;
  const key = menuKeyForElement(element);
  if (!key) return;
  const hasChildren = Boolean(element.querySelector('.p-panelmenu-submenu-icon'));
  if (!hasChildren) return; // leaf entry: the whole click is the command
  if (onChevron) {
    suppressNextMenuCommand.value = true;
    setTimeout(() => { suppressNextMenuCommand.value = false; }, 0);
    return;
  }
  // Headers without a registered open command keep PrimeVue's default
  // behavior (the click toggles the panel); only commanded headers split
  // open-content from collapse.
  const open = menuOpenTargets.get(key);
  if (!open) return;
  event.stopPropagation();
  open({ originalEvent: event });
}

function typePanelItem(node) {
  return {
    key: node.key,
    id: `home-type-${node.data.typeId}`,
    label: node.label,
    // Class names carry no icon: the glyph is the instance signal, so a
    // type panel never reads as one of its own rows. Headers also keep
    // full color — muting marks non-selected entries (instances,
    // communication), categories stay legible.
    typeId: node.data.typeId,
    command: menuCommand(node.key, () => openTypeScreen(node.data.screen)),
    items: (node.children || []).map(child => (
      child.data?.typeId ? typePanelItem(child) : entityPanelItem(child)
    ))
  };
}

// PanelMenu renders the expand chevron only for items carrying non-empty
// `items`, so an expandable row whose children are not loaded yet wears a
// single invisible placeholder: the chevron exists from the start, toggling
// it drives the lazy child load, and the real rows replace the placeholder.
const pendingChildrenItem = Object.freeze({ visible: false });

function entityPanelItem(node) {
  const instanceIdValue = instanceId(node.data.item.entity);
  // Rows mute unless THEIR instance is open — opening the type screen
  // never unmutes the whole list.
  const selected = selectedMenuKeys.value.has(`${node.data.item.type}:${instanceIdValue}`);
  return {
    key: node.key,
    icon: instances.iconFor(node.data.item.type),
    label: instanceLabelOf(node.data.item.type, instanceIdValue),
    class: selected ? 'rounded-ui bg-[var(--ck-chrome-subtle)]' : 'text-muted',
    workspaceItem: node.data.item,
    command: menuCommand(node.key, () => openInstanceTab(node.data.item.type, instanceIdValue)),
    items: node.children?.length
      ? node.children.map(entityPanelItem)
      : (node.leaf === false ? [pendingChildrenItem] : undefined)
  };
}

// Communication is ONE panel: Chats and Calls are flat sibling rows
// inside it — Chats opens the chats workspace page, Calls is always
// present and toggles the CommunicationMenu flyout listing every
// ringable conversation — and active call rooms render as further flat
// rows, only while a room is active. Nothing is nested under anything.
// PanelMenu, two communication entries: Chats is a plain entry opening
// the chats workspace page; Calls is always present, toggles the
// CommunicationMenu flyout listing every ringable conversation, and
// carries active rooms as its rows — only while rooms exist.
function communicationPanelModels() {
  const rooms = activeRoomItems();
  const chatsSelected = selectedMenuKeys.value.has('communication:chats');
  return [
    {
      key: 'communication:chats',
      label: t('support.chatTitle'),
      icon: 'pi pi-comments',
      headerClass: chatsSelected ? 'rounded-ui bg-[var(--ck-chrome-subtle)]' : 'text-muted',
      command: menuCommand('communication:chats', () => openChatsPage())
    },
    {
      key: 'communication:calls',
      label: t('call.calls'),
      icon: 'pi pi-phone',
      headerClass: 'text-muted',
      command: menuCommand('communication:calls', ({ originalEvent }) => callsFlyout.value?.toggle(originalEvent)),
      ...(rooms.length ? { items: rooms } : {})
    }
  ];
}

// Ongoing rooms live as persistent flat rows under the Calls entry; only
// brand-new invites float (IncomingCalls).
function activeRoomItems() {
  return callsStore.activeRooms.map(room => ({
    key: `call-room:${room.room}`,
    icon: callRoomIcon(room.kind),
    label: room.participants ? `${activeRoomLabel(room)} (${room.participants})` : activeRoomLabel(room),
    command: () => openCallTab(room.room, { conversationKey: conversationKeyForRoom(room.room) })
  }));
}

// The sidebar footer's second line: the active organization's name (the
// account menu switches organizations; the footer names where the user
// currently works).
const activeOrganizationLabel = computed(() => {
  const activeId = authStore.userData?.organizationId?.toString();
  if (!activeId) return '';
  const active = (authStore.userOrganizations || []).find(organization =>
    (organization._id?.toString() || organization.id?.toString()) === activeId);
  return active?.identity?.name || active?.name || '';
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
  const sectionInstances = section ? sectionItemsFor(section.region.id) : [];
  const screen = typeScreenFor(typeId);
  return {
    key: typeMenuKey(typeId),
    label: typeLabelOf(typeId),
    icon: instances.iconFor(typeId),
    selectable: true,
    data: { typeId, screen, section },
    leaf: !children.length && !sectionInstances.length,
    children: [...children, ...sectionInstances.map(item => entityNode(item))]
  };
}

function typeMenuKey(typeId = '') {
  return `type:${typeId}`;
}

// Mobile content follows the app-shell bottom bar's selection — the
// shared mobile home tab state over the sidebar tree's root types (see
// composables/useMobileHomeTabs.js, the canonical contract for both).
const { tabs: mobileHomeTabs, activeKey: mobileHomeTabKey } = useMobileHomeTabs();
const mobileTypeScreen = computed(() => (
  mobileHomeTabs.value.find(tab => tab.key === mobileHomeTabKey.value)?.screen || null
));

// Mobile record opens ROUTE to the compiled detail screen — no popup
// middleman (owner call 2026-09-30: the item-popup contract was slop).
function routeInstanceToScreen(typeId, instanceId) {
  const route = detailRouteForInstance({
    entity: { _id: instanceId },
    typeId,
    manifest: authStore.screenManifest
  });
  if (route) navigateTo(route);
  return Boolean(route);
}

function openMobileInstance(instance = {}) {
  routeInstanceToScreen(instance.type, instance.id);
}

function typeLabelOf(typeId = '') {
  const record = registryStore.typeRecord(typeId);
  // Procedural label contract only: the generated type key (locale
  // override) over the authored type name — no entity contracts, no raw
  // ids.
  if (!record) return typeId;
  return localizedLabel({ te, t }, typeLabelKey(typeId), record.name || '');
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
  return localizedLabel({ te, t }, screen?.typeId ? typeLabelKey(screen.typeId) : '', screen?.label || screen?.typeId || screenKey);
}

// Instance tab titles follow the render identity contract over the
// instances pool (the screen hosts load the same pool); a not-yet-loaded
// instance falls back to its type label until hydration lands.
function instanceLabelOf(typeId = '', id = '') {
  const typeRecord = registryStore.typeRecord(typeId);
  const entity = instances.records?.[instances.canonicalTypeKey(typeId)]?.[String(id)];
  if (typeRecord && entity) {
    return titleFor(dtoToScreenInstance(entity.dto, typeRecord), typeRecord, { unnamedLabel: t('common.unnamed') });
  }
  return typeLabelOf(typeId || id) || '';
}

// An instance opens as a compiled detail-screen tab in the active pane —
// never a separate route and never an entity renderer: the manifest's
// instanceDetail screen first, the synthesized fallback (from the type's
// list screen) second. Editor-bound types route to their registered
// editor page instead; types with no compiled detail screen and no editor
// but a registered entity-bound workspace page (the directory surface for
// `user`/`organization`) open that page as the pane tab; a type with none
// of the three stays silent, exactly like
// the routed surface contract.
function openInstanceTab(typeId = '', instanceIdValue = '') {
  if (!typeId || !instanceIdValue || !activePane.value) return;
  const detail = resolveDetailScreen({ screens: authStore.screenManifest, typeId });
  const screenKey = detail ? (detail.screenKey || detail.id) : null;
  const key = screenKey ? `screen:${screenKey}:${instanceIdValue}` : '';
  if (key && !openedScreenRefs.value.some(reference => reference.key === key)) {
    openedScreenRefs.value = [...openedScreenRefs.value, {
      key,
      screenKey,
      typeId,
      instanceId: instanceIdValue
    }];
  }
  if (key) {
    selectPaneTab(activePane.value.id, key);
    return;
  }
  // Served editor list by default (undefined editors → the documented
  // binding default), exactly like the other editor-surface consumers.
  const surface = resolveFileSurface(undefined, typeId);
  if (surface?.workspacePage) {
    openWorkspacePage({ pageId: surface.surface, typeId, entity: { _id: instanceIdValue } });
    return;
  }
  // Entity-bound workspace pages are the last fallback: types with no
  // compiled detail screen and no editor (user, organization) still open
  // as pane tabs through their registered directory page — never as a
  // standalone route.
  const fallbackPageId = entityWorkspacePageIdFor(typeId);
  if (fallbackPageId) {
    openWorkspacePage({ pageId: fallbackPageId, typeId, entity: { _id: instanceIdValue } });
  }
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
  const expandTypes = nodes => {
    for (const node of nodes) {
      if (node.data?.typeId && !(node.key in next)) next[node.key] = true;
      expandTypes(node.children || []);
    }
  };
  expandTypes(value);
  expandedKeys.value = next;
}, { immediate: true });

// Active rooms must be visible the moment they exist: the Calls entry
// carries them as rows, so it auto-expands on the empty-to-active
// transition (initial load included); an explicit collapse while calls
// run stays respected until the next call starts.
watch(() => callsStore.activeRooms.length, (count, previous = 0) => {
  if (count > 0 && previous === 0) {
    expandedKeys.value = { ...expandedKeys.value, 'communication:calls': true };
  }
}, { immediate: true });

// Post-mount only (contract: components/generated/README.md)
function applyPersistedWorkspaceState(key) {
  if (!key) return;
  const state = loadHomeWorkspaceState(window.localStorage, key);
  paneTree.value = state.paneTree;
  activePaneId.value = state.activePaneId;
  paneSequence.value = state.paneSequence;
  openedEntityRefs.value = state.openedEntityRefs;
  openedPageRefs.value = state.openedPageRefs;
  openedScreenRefs.value = state.openedScreenRefs || [];
  sidebarCollapsed.value = Boolean(state.sidebarCollapsed);
  hydratedStorageKey.value = key;
}

onMounted(() => {
  isWorkspaceMounted = true;
  applyPersistedWorkspaceState(workspaceStorageKey.value);
});

watch(workspaceStorageKey, key => {
  if (!key || !isWorkspaceMounted || hydratedStorageKey.value === key) return;
  applyPersistedWorkspaceState(key);
});

watch(
  [paneTree, activePaneId, paneSequence, openedEntityRefs, openedPageRefs, openedScreenRefs, sidebarCollapsed],
  () => {
    const key = workspaceStorageKey.value;
    if (!key || hydratedStorageKey.value !== key || typeof window === 'undefined') return;
    saveHomeWorkspaceState(window.localStorage, key, {
      paneTree: paneTree.value,
      activePaneId: activePaneId.value,
      paneSequence: paneSequence.value,
      openedEntityRefs: openedEntityRefs.value,
      openedPageRefs: openedPageRefs.value,
      openedScreenRefs: openedScreenRefs.value,
      sidebarCollapsed: sidebarCollapsed.value
    });
  },
  { deep: true }
);

watch(openedEntityRefs, async refs => {
  const sequence = ++openedEntityLoadSequence;
  const loaded = await Promise.all(refs.map(async reference => {
    const existing = workspaceEntityItems.value.find(item => (
      item.type === reference.typeId && instanceId(item.entity) === reference.instanceId
    ));
    const entity = existing?.entity
      || await instances.resolveReadableReference(instances.canonicalTypeKey(reference.typeId), reference.instanceId, { silent: true });
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

// Desktop instance links open as compiled detail-screen tabs: live events
// while the home workspace is mounted, pending requests (stashed before
// navigating home) consumed on mount. Mobile viewports have no panes: the
// directory types open as the bounded home dialog instead (entity types
// with a compiled detail screen keep the routed mobile contract).
function openRequestedWorkspaceEntity(event) {
  event?.preventDefault?.();
  const { typeId, instanceId } = event?.detail || {};
  if (!typeId || !instanceId) return;
  if (isMobileViewport.value && routeInstanceToScreen(typeId, instanceId)) return;
  openInstanceTab(typeId, instanceId);
}

const isMobileViewport = ref(false);
let mobileViewportQuery = null;
function readMobileViewport() {
  isMobileViewport.value = Boolean(typeof window !== 'undefined'
    && window.matchMedia?.('(max-width: 767px)')?.matches);
}
readMobileViewport();

onMounted(() => {
  window.addEventListener(workspaceInstanceOpenEvent, openRequestedWorkspaceEntity);
  window.addEventListener(workspaceChatOpenEvent, openRequestedWorkspaceChat);
  window.addEventListener(workspacePageOpenEvent, openRequestedWorkspacePage);
  mobileViewportQuery = typeof window !== 'undefined' ? window.matchMedia?.('(max-width: 767px)') : null;
  mobileViewportQuery?.addEventListener?.('change', readMobileViewport);
  const pending = consumePendingWorkspaceInstance();
  if (pending?.typeId) openRequestedWorkspaceEntity({ detail: pending });
  const pendingChat = consumePendingWorkspaceChat();
  if (pendingChat) openRequestedWorkspaceChat({ detail: pendingChat });
  const pendingPage = consumePendingWorkspacePage();
  if (pendingPage?.pageId) openRequestedWorkspacePage({ detail: pendingPage });
});

onBeforeUnmount(() => {
  window.removeEventListener(workspaceInstanceOpenEvent, openRequestedWorkspaceEntity);
  window.removeEventListener(workspaceChatOpenEvent, openRequestedWorkspaceChat);
  window.removeEventListener(workspacePageOpenEvent, openRequestedWorkspacePage);
  mobileViewportQuery?.removeEventListener?.('change', readMobileViewport);
});

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

// Pinned chat tabs are ephemeral like calls: the sidebar Chats entry opens
// the general tab and the bottom-right popup's expand action pins one
// conversation as its own tab.
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

// Registered workspace pages (the organization management surfaces,
// including the process designer) open as pane tabs from chrome through
// the page-open seam.
function openRequestedWorkspacePage(event) {
  event?.preventDefault?.();
  const { pageId, entity, typeId } = event?.detail || {};
  if (!pageId) return;
  openWorkspacePage({ pageId, entity, typeId });
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

// The CommunicationMenu's start-call action: ring the chosen
// conversation and open the room as a call tab. Label comes from the
// conversation summary the menu emitted; empty falls back to the call
// page's own title in the tab strip.
async function startCallFromConversation(conversation = {}) {
  if (!conversation.conversationKey) return;
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

// Chats have two desktop surfaces: the sidebar PanelMenu entry opens the
// chats pane tab (create-or-select), while popup-originated threads
// (comments, chat actions, the launcher) live in the shared bottom-right
// popup whose expand action pins the conversation as one of these tabs.
function openChatsPage() {
  openChatTab();
}

function sectionItemsFor(regionId) {
  const section = sections.value.find(candidate => candidate.region.id === regionId);
  return section ? sectionItems.value.filter(item => (
    item.type === section.source.typeId
    && section.items.some(entity => instanceId(entity) === instanceId(item.entity))
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

function toggleSidebarCollapsed() {
  sidebarCollapsed.value = !sidebarCollapsed.value;
}

// Expanding an entity panel lazy-loads its children, exactly like the old
// tree's node-expand: containment and relation sources resolve on demand.
watch(expandedKeys, (next, prev = {}) => {
  for (const [key, expanded] of Object.entries(next)) {
    if (!expanded || prev[key]) continue;
    const item = workspaceEntityItems.value.find(candidate => candidate.key === key);
    if (item) loadChildrenFor(item);
  }
});

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
    .filter(item => item?.entity && instanceId(item.entity) && !known.has(item.key));
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
      const childInstances = await instances.listInstances(instances.canonicalTypeKey(source.typeId), source.filters);
      return (Array.isArray(childInstances) ? childInstances : []).map(instance => workspaceEntityItem(source.typeId, instance));
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
      entity = await instances.resolveReadableReference(instances.canonicalTypeKey(parent.type), instanceId(entity), { silent: true }) || entity;
    } catch {
      entity = entity;
    }
  }
  const refs = relationRefsFor(entity);
  const loaded = await Promise.all(refs.map(async ref => {
    const existing = workspaceEntityItems.value.find(item => (
      item.type === ref.typeId && instanceId(item.entity) === ref.id
    ));
    const resolved = existing?.entity
      || ref.entity
      || await instances.resolveReadableReference(instances.canonicalTypeKey(ref.typeId), ref.id, { silent: true }).catch(() => null);
    return resolved ? workspaceEntityItem(ref.typeId, resolved) : null;
  }));
  return loaded.filter(Boolean);
}

function relationRefsFor(entity = {}) {
  return Object.values(entity?.relations || {}).flatMap(value => resolveInstanceRelationRefs(value));
}

function hasRelationRefs(entity = {}) {
  return relationRefsFor(entity).length > 0;
}

function activatePane(paneId) {
  activePaneId.value = paneId;
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

  // No pane exists without a tab: closing the last tab closes the pane,
  // except the workspace's last pane, which resets to a fresh empty tab.
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

// Tab references (pages, screens, call stages) die with their last tab:
// once no leaf carries the closed key, its refs are forgotten.
function forgetClosedTabRefs(key) {
  const remainingTabKeys = new Set(workspaceLeaves(paneTree.value).flatMap(leaf => leaf.tabKeys || []));
  if (!remainingTabKeys.has(key)) {
    openedPageRefs.value = openedPageRefs.value.filter(reference => reference.key !== key);
    openedScreenRefs.value = openedScreenRefs.value.filter(reference => reference.key !== key);
    callPageRefs.value = callPageRefs.value.filter(call => call.key !== key);
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
  activePaneId.value = workspaceLeaves(paneTree.value)[0]?.id || 'pane-1';
}

function openWorkspaceEntity(typeId, entity) {
  // Explorer hydration entry: remembers the record for the tree (nesting,
  // editor-page entities) and opens its compiled detail screen tab.
  const item = rememberWorkspaceEntity(typeId, entity);
  if (!item) return null;
  openInstanceTab(typeId, instanceId(item.entity));
  return item;
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
    && instanceId(item.entity) === instanceId(request.entity)
  ));
  if (!entityItem || !activePane.value) return;

  const key = workspacePageKey(definition.id, entityItem.entity);
  if (!openedPageRefs.value.some(page => page.key === key)) {
    openedPageRefs.value = [...openedPageRefs.value, {
      key,
      pageId: definition.id,
      typeId: definition.typeId,
      instanceId: instanceId(entityItem.entity)
    }];
  }
  selectPaneTab(activePane.value.id, key);
}

function rememberWorkspaceEntity(typeId, entity) {
  const id = instanceId(entity);
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
      instanceId: id
    }];
  }
  return item;
}

function executeWorkspaceAction(action, entry = {}) {
  emit('execute-action', action, entry.entity ?? null, entry.context || contextForItem(entry.item));
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

function workspacePageKey(pageId, entity) {
  return `page:${pageId}:${instanceId(entity)}`;
}

function entityKey(type, entity) {
  return `${type}:${instanceId(entity)}`;
}

function workspaceEntityItem(type, entity) {
  return {
    key: entityKey(type, entity),
    kind: 'instance',
    type,
    entity,
    region: sectionRegionForEntity(type, entity)
  };
}

function sectionRegionForEntity(type, entity) {
  const section = sections.value.find(candidate => (
    candidate.source.typeId === type
    && candidate.items.some(item => instanceId(item) === instanceId(entity))
  ));
  return section?.region || null;
}

function instanceId(entity = null) {
  const value = entity?._id || entity?.identity?.uid || '';
  return value ? String(value) : '';
}
</script>

