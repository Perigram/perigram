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
            @click="tabs.openScreenTab(node.data.screen)"
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
          @activate="tabs.activatePane"
          @resize="tabs.resizePaneSplit"
        >
          <template #default="{ pane }">
            <GeneratedWorkspacePane
              :item="tabs.itemForPane(pane)"
              :tabs="tabs.tabItemsForPane(pane)"
              :selection-key="pane.selectionKey"
              :closeable="paneCount > 1"
              :back="tabs.paneHasHistory(pane.id)"
              @back="tabs.goBackFromPane(pane.id)"
              @execute-action="executeWorkspaceAction"
              @open-entity="request => openWorkspaceEntity(request.typeId, { _id: request.instanceId }, { editor: request.editor === true })"
              @open-page="tabs.openWorkspacePage"
              @open-call="request => tabs.openCallTab(request.room, request)"
              @refresh="$emit('refresh')"
              @select-tab="key => tabs.selectPaneTab(pane.id, key)"
              @close-tab="key => tabs.closePaneTab(pane.id, key)"
              @add-tab="tabs.openEmptyPaneTab(pane.id)"
              @split="orientation => tabs.splitPane(pane.id, orientation)"
              @close="tabs.closePane(pane.id)"
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
        <GeneratedScreenHost
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
import Avatar from 'primevue/avatar';
import PanelMenu from 'primevue/panelmenu';
import { useI18n } from 'vue-i18n';
import UserAccountMenu from '~/components/shared/UserAccountMenu.vue';
import WorkspaceSplitNode from '~/components/shared/WorkspaceSplitNode.vue';
import CommunicationMenu from '~/components/shared/CommunicationMenu.vue';
import { consumePendingWorkspaceInstance, workspaceInstanceOpenEvent } from '~/utils/instance-workspace-open.js';
import { useEntityPopup } from '~/composables/useEntityPopup';
import { consumePendingWorkspaceChat, workspaceChatOpenEvent } from '~/utils/chat-workspace-open.js';
import { consumePendingWorkspacePage, workspacePageOpenEvent } from '~/utils/workspace-page-open.js';
import GeneratedScreenHost from '~/components/generated/GeneratedScreenHost.vue';
import GeneratedWorkspacePane from '~/components/generated/GeneratedWorkspacePane.vue';
import { entityPoolKey } from '~/utils/workspace-tab-keys.js';
import { homeWorkspaceStorageKey } from '~/utils/home-workspace-state.js';
import { detailRouteForInstance } from '~/components/generated/instance-detail-routing.js';
import { useAuthStore } from '~/stores/auth';
import { useInstancesStore } from '~/stores/instances';
import { useRegistryStore } from '~/stores/registry';
import { useSupportChatStore } from '~/stores/supportChat';
import { useCallsStore } from '~/stores/calls';
import { useEffectiveContainment } from '~/composables/useEffectiveContainment.js';
import { useMobileHomeTabs } from '~/composables/useMobileHomeTabs.js';
import { useWorkspaceTabs } from '~/composables/useWorkspaceTabs.js';
import { callRoomIcon, callRoomLabel, conversationKeyForRoom } from '~/utils/call-rooms.js';
import { shouldRenderHomeSection } from '~/utils/generated-screen-source.js';
import { linkedExplorerChildSources } from '~/utils/project-linked-child-sources.js';
import { resolveInstanceRelationRefs } from '~/utils/instance-relations.js';
import { containmentParent, normalizeHierarchyType } from '~/utils/instance-hierarchy.js';

const props = defineProps({
  screen: { type: Object, required: true },
  sourceState: { type: Function, required: true },
  screenActions: { type: Array, default: () => [] }
});

const emit = defineEmits(['refresh', 'execute-action']);

const authStore = useAuthStore();
const entityPopup = useEntityPopup();
const instances = useInstancesStore();
const registryStore = useRegistryStore();
const supportChatStore = useSupportChatStore();
const callsStore = useCallsStore();
const effectiveContainment = useEffectiveContainment();
const { t, te } = useI18n();
const sidebarCollapsed = ref(false);
const expandedKeys = ref({});
const callsFlyout = ref(null);
const linkedChildrenByKey = ref(new Map());
const loadedChildKeys = ref(new Set());
let childLoadSequences = new Map();
provide('displayedEntityContexts', computed(() => []));

const workspaceStorageKey = computed(() => homeWorkspaceStorageKey({
  userId: authStore.userData?.id || authStore.userData?.userId || authStore.userData?._id,
  organizationId: authStore.organizationData?._id || authStore.userData?.organizationId
}));
const currentUserId = computed(() => String(
  authStore.userData?.id || authStore.userData?.userId || authStore.userData?._id || ''
));

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
  .filter(section => section.source.typeId && shouldRenderHomeSection(section))
  // A sectioned type that contains ITSELF keeps only root rows: children
  // of loaded instances nest under their parents (entityNode), never
  // beside them. Declared self-containment (org children edges)
  // contributes no compiled binding, so the same cut runs here over the
  // merged containment the nesting itself reads.
  .map(section => (selfContainmentKeys(section.source.typeId).length
    ? { ...section, items: rootSectionItems(section) }
    : section)));

function sectionEntityItem(typeId, entity) {
  return { key: entityPoolKey(typeId, instanceId(entity)), kind: 'instance', type: typeId, entity };
}

const sectionItems = computed(() => sections.value.flatMap(section => section.items
  .filter(entity => instanceId(entity))
  .map(entity => sectionEntityItem(section.source.typeId, entity))));

// Self-containment edges of one type (the merged view the nesting reads).
function selfContainmentKeys(typeId = '') {
  const normalized = normalizeHierarchyType(typeId);
  return [...new Set(effectiveContainment()
    .filter(relation => relation.parentType === relation.childType
      && normalizeHierarchyType(relation.childType) === normalized
      && relation.lineageKey)
    .map(relation => relation.lineageKey))];
}

// Root rows of a self-recursive section: an item whose parent ref (through
// the self edges, both stored ref shapes) points at another loaded item of
// the same section is a child — it nests under its parent, never lists
// beside it.
function rootSectionItems(section) {
  const keys = selfContainmentKeys(section.source.typeId);
  const loadedIds = new Set((section.rawItems || section.items || [])
    .map(entity => instanceId(entity)).filter(Boolean));
  return (section.items || []).filter(entity => !keys
    .some(key => loadedIds.has(String(entity?.lineage?.[key]?.id ?? entity?.lineage?.[key] ?? ''))));
}

const tabs = useWorkspaceTabs({
  storageKey: workspaceStorageKey,
  sectionItems,
  sidebarCollapsed
});

const {
  paneTree, activePaneId, paneCount, activePane, workspaceItems, workspaceEntityItems
} = tabs;

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
    const parentRef = parent && item.entity?.lineage?.[parent.lineageKey];
    const parentId = parentRef?.id ?? parentRef;
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

// Types worth rendering: exactly the screen-backed types of the active
// process. Registry-only types never render — a declaration some OLD
// apply posted (a group the current definition never authored) must not
// phantom into the app as a "structural" node: no station, no UI.
const visibleTypes = computed(() => new Set(screenfulTypes.value));

const sidebarMenuModel = computed(() => [
  ...communicationPanelModels(),
  ...explorerNodes.value.map(node => typePanelItem(node))
]);

// Menu selection follows the active pane's selected tab: a type screen
// selects its type panel, an instance/detail/page tab selects its entity
// row plus the owning type panel, and the chats page selects Chats.
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
    if (instanceIdValue) keys.add(entityPoolKey(typeId, instanceIdValue));
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
    command: menuCommand(node.key, () => tabs.openScreenTab(node.data.screen)),
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
  const selected = selectedMenuKeys.value.has(entityPoolKey(node.data.item.type, instanceIdValue));
  return {
    key: node.key,
    icon: instances.iconFor(node.data.item.type),
    label: tabs.instanceLabelOf(node.data.item.type, instanceIdValue),
    class: selected ? 'rounded-ui bg-[var(--ck-chrome-subtle)]' : 'text-muted',
    workspaceItem: node.data.item,
    command: menuCommand(node.key, () => tabs.openInstanceTab(node.data.item.type, instanceIdValue)),
    items: node.children?.length
      ? node.children.map(entityPanelItem)
      : (node.leaf === false ? [pendingChildrenItem] : undefined)
  };
}

// Communication is two entries: Chats is a plain entry opening the chats
// workspace page; Calls is always present, toggles the CommunicationMenu
// flyout listing every ringable conversation, and carries active rooms as
// its rows — only while rooms exist.
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
    command: () => tabs.openCallTab(room.room, { conversationKey: conversationKeyForRoom(room.room) })
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
    // Self-containment is instance-level nesting (entityNode children),
    // never a type node under itself — otherwise the recursive type roots
    // itself out of the explorer.
    if (triple.childType === triple.parentType) continue;
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
    label: tabs.typeLabelOf(typeId),
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
// middleman.
function routeInstanceToScreen(typeId, instanceIdValue) {
  const route = detailRouteForInstance({
    entity: { _id: instanceIdValue },
    typeId,
    manifest: authStore.screenManifest
  });
  if (route) navigateTo(route);
  return Boolean(route);
}

function openMobileInstance({ typeId, instanceId: instanceIdValue } = {}) {
  routeInstanceToScreen(typeId, instanceIdValue);
}

function typeScreenFor(typeId = '') {
  return (authStore.screenManifest || []).find(screen => (
    screen.typeId === typeId && screen.template === 'typeList'
  )) || null;
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

// The explorer's session caches die with the workspace scope (user or
// organization switch) together with the tab lifecycle state.
watch(workspaceStorageKey, () => {
  loadedChildKeys.value = new Set();
  linkedChildrenByKey.value = new Map();
});

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
// home workspace navigates home to consume it.
watch(() => callsStore.pendingTabRoom, room => {
  if (!room) return;
  tabs.openCallTab(room, { conversationKey: conversationKeyForRoom(room) });
  callsStore.consumePendingTabRoom();
}, { immediate: true });

// Desktop instance links open as compiled detail-screen tabs: live events
// while the home workspace is mounted, pending requests (stashed before
// navigating home) consumed on mount. Mobile viewports have no panes: the
// directory types open as the bounded home dialog instead (entity types
// with a compiled detail screen keep the routed mobile contract).
function openRequestedWorkspaceEntity(event) {
  event?.preventDefault?.();
  const { typeId, instanceId: instanceIdValue, editor } = event?.detail || {};
  if (!typeId || !instanceIdValue) return;
  if (isMobileViewport.value) {
    if (routeInstanceToScreen(typeId, instanceIdValue)) return;
    // The active organization's real page is the org overview system
    // screen — the directory profile popup is for other records.
    if (typeId === 'organization' && isActiveOrganization(instanceIdValue)) {
      navigateTo(organizationOverviewRoute());
      return;
    }
    entityPopup.open({ typeId, instanceId: String(instanceIdValue) });
    return;
  }
  openWorkspaceEntity(typeId, { _id: instanceIdValue }, { editor: editor === true });
}

function isActiveOrganization(instanceIdValue = '') {
  const activeId = authStore.organizationData?._id || authStore.userData?.organizationId || '';
  return Boolean(activeId) && String(instanceIdValue) === String(activeId);
}

function organizationOverviewRoute() {
  return authStore.screenManifest.find(screen => (
    screen.kind === 'system' && screen.template === 'organizationOverview'
  ))?.route || '/organization';
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

function openRequestedWorkspaceChat(event) {
  event?.preventDefault?.();
  const { conversationKey, label } = event?.detail || {};
  tabs.openChatTab(conversationKey || '', typeof label === 'string' ? label : '');
}

// Registered workspace pages (the organization management surfaces,
// including the process designer) open as pane tabs from chrome through
// the page-open seam.
function openRequestedWorkspacePage(event) {
  event?.preventDefault?.();
  const { pageId, entity, typeId, params } = event?.detail || {};
  if (!pageId) return;
  tabs.openWorkspacePage({ pageId, entity, typeId, params });
}

// The CommunicationMenu's start-call action: ring the chosen
// conversation and open the room as a call tab.
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
    tabs.openCallTab(invite.room, {
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
  tabs.openChatTab();
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
  tabs.addSessionEntities([...sourceChildren, ...relationChildren]);
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
      return (Array.isArray(childInstances) ? childInstances : []).map(instance => sectionEntityItem(source.typeId, instance));
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
      // keep the list-DTO shape
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
    return resolved ? sectionEntityItem(ref.typeId, resolved) : null;
  }));
  return loaded.filter(Boolean);
}

function relationRefsFor(entity = {}) {
  return Object.values(entity?.relations || {}).flatMap(value => resolveInstanceRelationRefs(value));
}

function hasRelationRefs(entity = {}) {
  return relationRefsFor(entity).length > 0;
}

// Explorer hydration entry: remembers the record for the tree (nesting,
// editor-page entities) and opens its compiled detail screen tab.
function openWorkspaceEntity(typeId, entity, { editor = false } = {}) {
  tabs.rememberEntity(typeId, entity);
  tabs.openInstanceTab(typeId, instanceId(entity), { editor });
}

function executeWorkspaceAction(action, entry = {}) {
  emit('execute-action', action, entry.entity ?? null, entry.context || {});
}

function instanceId(entity = null) {
  const value = entity?._id || entity?.identity?.uid || '';
  return value ? String(value) : '';
}
</script>
