<template>
  <div class="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
    <div class="hidden h-full min-h-0 flex-1 overflow-hidden md:flex" data-home-workspace>
      <aside
        :class="['flex min-w-0 shrink-0 flex-col transition-[width] duration-200', sidebarCollapsed ? 'w-14' : 'w-64']"
        :aria-label="$t('nav.home')"
      >
        <!-- Brand panel owns the wrap control: the wordmark shrinks to the
             mark and the toggle flips with it; the create control sits
             beside the toggle in the expanded shape (SPEC §4: the home
             shell's one create control), and the wrapped rail below
             carries it when collapsed. -->
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
          <div v-if="!sidebarCollapsed" class="flex items-center gap-1">
            <Button
              icon="pi pi-chevron-left"
              text
              rounded
              size="small"
              severity="secondary"
              :aria-label="$t('nav.collapseSidebar')"
              @click="toggleSidebarCollapsed"
            />
          </div>
          <template v-else>
            <Button
              icon="pi pi-chevron-right"
              text
              rounded
              size="small"
              severity="secondary"
              :aria-label="$t('nav.expandSidebar')"
              @click="toggleSidebarCollapsed"
            />
          </template>
        </header>

        <!-- Wrapped rail: the create control, then communication first
             (chats, calls — the same order the expanded menu leads
             with), then one icon per top-level panel; the brand mark,
             profile avatar, and this rail are the whole sidebar. -->
        <nav
          v-if="sidebarCollapsed"
          class="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto p-1.5"
          :aria-label="$t('nav.home')"
        >
          <span class="relative inline-flex">
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
            <Badge
              v-if="supportChatStore.totalUnread"
              :value="supportChatStore.totalUnread"
              severity="danger"
              size="small"
              class="absolute -right-1.5 -top-1.5"
            />
          </span>
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
            @click="openClassPage(node.data.typeId)"
          />
          <Button
            v-for="section in userSections"
            :key="section._id"
            icon="pi pi-folder-open"
            text
            rounded
            size="small"
            severity="secondary"
            :aria-label="sectionLabel(section)"
            :title="sectionLabel(section)"
            @click="expandSectionFromRail(section)"
          />
        </nav>

        <!-- Expanded navigation is one raw PanelMenu: two communication
             entries first — Chats opens the chats page, and Calls toggles
             its suggestions flyout and carries active call rooms as rows
             only while calls run — then one panel per top-level explorer
             type, the user sections with their nested pages, and loose
             root pages; the new-section affordance sits at the foot.
             Default rows carry the registry icons and title-resolver
             labels. The capture click handler splits header and row
             clicks from collapse toggling (chevron-only); the same seam
             routes context gestures (right-click, long-press) on user
             sections and pages to their context menu. -->
        <div
          v-else
          class="min-h-0 flex-1 overflow-y-auto p-1.5"
          @contextmenu.capture="onSidebarContextMenu"
          @touchstart.passive="onSidebarTouchStart"
          @touchmove.passive="onSidebarTouchCancel"
          @touchend="onSidebarTouchCancel"
          @touchcancel="onSidebarTouchCancel"
        >
          <PanelMenu
            v-model:expanded-keys="expandedKeys"
            :model="sidebarMenuModel"
            multiple
            class="w-full"
            :aria-label="$t('nav.home')"
            :pt="menuPt"
            @click.capture="onMenuClickCapture"
          >
            <template #headericon="{ item, class: iconClass }">
              <template v-if="item.key === 'communication:chats' && supportChatStore.totalUnread">
                <i :class="iconClass" aria-hidden="true" />
                <Badge :value="supportChatStore.totalUnread" severity="danger" size="small" class="ml-auto order-last" />
              </template>
              <i v-else :class="iconClass" aria-hidden="true" />
            </template>
          </PanelMenu>
          <Button
            v-if="classesAvailable"
            :label="t('classes.newClass')"
            icon="pi pi-plus"
            text
            size="small"
            severity="secondary"
            class="mt-1 w-full justify-start text-muted"
            :aria-label="t('classes.newClass')"
            @click="openClassDialog()"
          />
        </div>

        <!-- Section and page authoring: the context menu, the rename and
             move dialogs over the organization's sections and pages. -->
        <ContextMenu ref="pagesContextMenu" :model="pagesMenuModel" />
        <ContextMenu ref="typeContextMenu" :model="typeMenuModel" />
        <StandardDialog
          v-model:visible="renameVisible"
          :title="t('common.rename')"
          size="sm"
          :save-disabled="!renameDraft.trim()"
          @cancel="renameVisible = false"
          @save="commitRename"
        >
          <InputText
            v-model="renameDraft"
            size="small"
            class="w-full"
            :placeholder="t('common.unnamed')"
            :aria-label="t('common.rename')"
            @keydown.enter.prevent="commitRename"
          />
        </StandardDialog>
        <StandardDialog
          v-model:visible="moveVisible"
          :title="t('pages.moveTitle')"
          size="sm"
          @cancel="moveVisible = false"
          @save="commitMove"
        >
          <TreeSelect
            :model-value="moveSelection"
            :options="moveTreeOptions"
            option-label="label"
            option-value="key"
            selection-mode="single"
            class="w-full"
            :placeholder="t('pages.root')"
            @update:model-value="keys => selectMoveKey(keys)"
          />
        </StandardDialog>

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
        <WorkspaceDock
          ref="workspaceDock"
          :items="workspaceTabItems"
          :has-back="paneHasHistory"
          allow-add
          allow-split
          allow-close-group
          @ready="onDockReady"
          @active-change="onDockActiveChange"
          @layout-change="onDockLayoutChange"
          @add-tab="openEmptyPaneTab"
          @close-tab="closePaneTab"
          @close-group="closePane"
          @split="splitPane"
          @back="goBackFromPane"
        >
          <template #content="{ item }">
            <GeneratedWorkspacePane
              :item="item"
              @open-entity="request => openWorkspaceEntity(request.typeId, { _id: request.instanceId })"
              @open-page="openWorkspacePage"
              @open-call="request => openCallTab(request.room, request)"
              @refresh="$emit('refresh')"
              @close-tab="closePaneTab"
            />
          </template>
        </WorkspaceDock>
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

    <ClassDialog
      v-model:visible="classDialogVisible"
      :type-id="classDialogTypeId"
      :start-in-create="classDialogCreate"
    />
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Button from 'primevue/button';
import Avatar from 'primevue/avatar';
import Badge from 'primevue/badge';
import PanelMenu from 'primevue/panelmenu';
import ContextMenu from 'primevue/contextmenu';
import InputText from 'primevue/inputtext';
import TreeSelect from 'primevue/treeselect';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import { useI18n } from 'vue-i18n';
import UserAccountMenu from '~/components/shared/UserAccountMenu.vue';
import WorkspaceDock from '~/components/shared/WorkspaceDock.vue';
import CommunicationMenu from '~/components/shared/CommunicationMenu.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import { isWorkspacePageDirty, setWorkspacePageDirty } from '~/utils/workspace-page-dirty.js';
import { consumePendingWorkspaceInstance, workspaceInstanceOpenEvent } from '~/utils/instance-workspace-open.js';
import { useEntityPopup } from '~/composables/useEntityPopup';
import { consumePendingWorkspaceChat, workspaceChatOpenEvent } from '~/utils/chat-workspace-open.js';
import { consumePendingWorkspacePage, workspacePageOpenEvent } from '~/utils/workspace-page-open.js';
import GeneratedScreenHost from '~/components/generated/GeneratedScreenHost.vue';
import GeneratedWorkspacePane from '~/components/generated/GeneratedWorkspacePane.vue';
import ClassDialog from '~/components/type-designer/ClassDialog.vue';
import { titleFor, typeLabelKey, localizedLabel, iconFor } from '#shared/ui-mapping/index.js';
import { dtoToScreenInstance } from '~/utils/instance-shape.js';
import { resolveGeneratedWorkspacePage, generatedWorkspacePages, entityWorkspacePageIdFor } from '~/components/generated/workspace-pages.js';
import { resolveDetailScreen } from '~/components/generated/detail-screen-actions.js';
import { resolveFileSurface } from '~/components/generated/file-surfaces.js';
import { detailRouteForInstance } from '~/components/generated/instance-detail-routing.js';
import { screenByKey } from '~/utils/process-navigation.js';
import { useAuthStore } from '~/stores/auth';
import { useInstancesStore } from '~/stores/instances';
import { useRegistryStore } from '~/stores/registry';
import { useSupportChatStore } from '~/stores/supportChat';
import { useCallsStore } from '~/stores/calls';
import { usePagesStore } from '~/stores/pages';
import { useEffectiveContainment } from '~/composables/useEffectiveContainment.js';
import { useFileTypeView } from '~/composables/useFileTypeView.js';
import { PAGE_TYPE_ID } from '~/packages/cts/src/index.js';
import { useMobileHomeTabs } from '~/composables/useMobileHomeTabs.js';
import { callRoomIcon } from '~/utils/call-rooms.js';
import { useCallRoomLabel } from '~/composables/useCallRoomLabel.js';
import { conversationKeyForRoom } from '#shared/call-rooms.js';
import { shouldRenderHomeSection } from '~/utils/generated-screen-source.js';
import { linkedExplorerChildSources } from '~/utils/project-linked-child-sources.js';
import { resolveInstanceRelationRefs } from '~/utils/instance-relations.js';
import { containmentParent, normalizeHierarchyType } from '~/utils/instance-hierarchy.js';
import { emptyTabKey, isEmptyTabKey } from '~/utils/workspace-empty-tabs.js';
import { pruneDockLayout } from '~/utils/workspace-dock-layout.js';
import {
  homeWorkspaceStorageKey,
  loadHomeWorkspaceState,
  saveHomeWorkspaceState
} from '~/utils/home-workspace-state.js';

const props = defineProps({
  screen: { type: Object, required: true },
  sourceState: { type: Function, required: true }
});

const emit = defineEmits(['refresh']);

const authStore = useAuthStore();
const entityPopup = useEntityPopup();
const instances = useInstancesStore();
const registryStore = useRegistryStore();
const supportChatStore = useSupportChatStore();
const callsStore = useCallsStore();
const pagesStore = usePagesStore();
const classView = useFileTypeView();
const effectiveContainment = useEffectiveContainment();
const { t, te } = useI18n();
const confirm = useConfirm();
const toast = useToast();
const workspaceDock = ref(null);
const dockReady = ref(false);
const activeTabKey = ref('');
const activeGroupId = ref('');
const dockLayout = ref(null);
let pendingLayout = null;
let pendingActiveKey = '';
let pendingTabKeys = [];
let pendingCallTab = null;
let layoutHydrated = false;
// Per-pane navigation history: every in-place tab replacement pushes the
// replaced content key, and the pane header's Back control walks the
// stack. Session-only.
const paneHistories = ref(new Map());
const PANE_HISTORY_LIMIT = 50;
const sidebarCollapsed = ref(false);
const expandedKeys = ref({});
// Explicitly collapsed user sections persist with the workspace layout
// (v3-compatible addition); sections auto-expand on first sight
// otherwise, like the type hierarchy.
const collapsedSectionKeys = ref([]);
const callsFlyout = ref(null);
const openedEntityRefs = ref([]);
const openedPageRefs = ref([]);
const openedScreenRefs = ref([]);
const openedCustomPageRefs = ref([]);
const openedChatRefs = ref([]);
const openedEntityItems = ref([]);
const hydratedStorageKey = ref('');
let isWorkspaceMounted = false;
const linkedChildrenByKey = ref(new Map());
const loadedChildKeys = ref(new Set());
let openedEntityLoadSequence = 0;
let childLoadSequences = new Map();

// Layout-only passthrough: panel headers inherit the 1.5 line-height item
// labels dropped, which made top-level entries taller than their rows;
// entry labels crop with an ellipsis instead of wrapping rows tall — the
// submenu scaffold is a track-less grid whose items grow to content
// width, so its column takes minmax(0,1fr) before a label can crop.
const menuPt = {
  // Labels carry the muted tone directly: PanelMenu colors the content
  // wrappers, so inherited per-item classes never reach the text.
  headerLabel: { class: 'min-w-0 flex-1 truncate text-muted', style: { lineHeight: '1' } },
  itemLabel: { class: 'min-w-0 flex-1 truncate text-muted' },
  contentContainer: { class: 'grid-cols-1' }
};

// Loaded instances by type across every section source plus the lazy
// pool — the parent lookup the section root cut reads.
const loadedSectionPoolByType = computed(() => {
  const byType = new Map();
  const add = (typeId, entity) => {
    const key = normalizeHierarchyType(typeId || '');
    const id = instanceId(entity);
    if (!key || !id) return;
    if (!byType.has(key)) byType.set(key, new Set());
    byType.get(key).add(id);
  };
  for (const region of props.screen.regions) {
    const state = props.sourceState(region.sourceId);
    for (const entity of (state?.rawItems || state?.items || [])) add(state?.source?.typeId, entity);
  }
  for (const item of openedEntityItems.value) add(item.type, item.entity);
  return byType;
});

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
  // A sectioned type with a containment parent edge keeps root rows only:
  // a child of a loaded instance nests under its parent (entityNode), so
  // no instance lists beside its type node once its parent renders.
  .map(section => (parentContainmentEdges(section.source.typeId).length
    ? { ...section, items: rootSectionItems(section) }
    : section)));

const sectionItems = computed(() => sections.value.flatMap(section => section.items
  .filter(entity => instanceId(entity))
  .map(entity => workspaceEntityItem(section.source.typeId, entity))));

// Parent edges of a type through the merged containment — self-pairs and
// cross-type children edges alike.
function parentContainmentEdges(typeId = '') {
  const normalized = normalizeHierarchyType(typeId);
  return effectiveContainment()
    .filter(relation => normalizeHierarchyType(relation.childType) === normalized && relation.lineageKey)
    .map(relation => ({ parentType: relation.parentType, lineageKey: relation.lineageKey }));
}

// Root rows of a parented section: an item whose parent ref (both stored
// ref shapes) resolves to a loaded instance is a child of that instance.
function rootSectionItems(section) {
  const edges = parentContainmentEdges(section.source.typeId);
  const pool = loadedSectionPoolByType.value;
  return (section.items || []).filter(entity => !edges.some(edge => {
    const ref = entity?.lineage?.[edge.lineageKey];
    const parentId = ref?.id ?? ref;
    return Boolean(parentId) && pool.get(normalizeHierarchyType(edge.parentType))?.has(String(parentId));
  }));
}
const workspaceEntityItems = computed(() => [...sectionItems.value, ...openedEntityItems.value]
  .filter((item, index, items) => items.findIndex(candidate => candidate.key === item.key) === index));
const openedPageItems = computed(() => openedPageRefs.value.map(reference => {
  // Blank editor pages (SPEC §UI): a singleton entity-less tab keyed by
  // the page id — the editor's first save creates the record.
  if (!reference.instanceId) {
    return {
      key: reference.key,
      kind: 'page',
      pageId: reference.pageId,
      entity: null,
      typeId: reference.typeId || '',
      label: workspacePageLabel(reference.pageId)
    };
  }
  const entityItem = workspaceEntityItems.value.find(item => (
    item.type === reference.typeId
    && instanceId(item.entity) === reference.instanceId
  ));
  return {
    key: reference.key,
    kind: 'page',
    pageId: reference.pageId,
    entity: entityItem?.entity || null,
    typeId: reference.typeId,
    instanceId: reference.instanceId,
    pending: !entityItem,
    // Entity-bound page tabs label from the one title resolver like
    // instance tabs — the page id stays a fallback, not the display.
    label: instanceLabelOf(reference.typeId, reference.instanceId)
  };
}));
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
// `pageParamsByKey` carries one-shot intent (a preselected invite target)
// from the page-open seam to the opened singleton tab; it is transient —
// an intent is consumed by the page, not persisted with the layout.
const pageParamsByKey = ref({});
const staticPageItems = computed(() => generatedWorkspacePages()
  .filter(page => !page.typeId && !page.ephemeral)
  .map(page => ({ key: `page:${page.id}`, kind: 'page', pageId: page.id, params: pageParamsByKey.value[`page:${page.id}`] || null })));
const callPageItems = computed(() => callPageRefs.value.map(call => ({
  key: call.key,
  kind: 'page',
  pageId: 'call',
  room: call.room,
  conversationKey: call.conversationKey,
  label: call.label
})));
const chatPageItems = computed(() => openedChatRefs.value.map(chat => ({
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
  ...customPageItems.value,
  ...staticPageItems.value
].filter(Boolean).filter((item, index, items) => (
  items.findIndex(candidate => candidate.key === item.key) === index
)));
const workspaceTabItems = computed(() => workspaceItems.value.map(item => ({
  ...item,
  label: workspaceTabLabel(item),
  icon: workspaceTabIcon(item)
})));
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

// The explorer panels: one per stationed type that no other stationed
// type contains — a contained type's instances reach the sidebar beneath
// their parent instances. Panel rows are the type's home-section
// instances alone; the type list and the instance tree never blend.

const screenfulTypes = computed(() => new Set((authStore.screenManifest || [])
  .filter(screen => screen.typeId && screen.template === 'typeList')
  .map(screen => screen.typeId)));

// Types worth rendering: exactly the screen-backed types of the active
// process. Registry-only types never render — a declaration some OLD
// apply posted (a group the current definition never authored) must not
// phantom into the app as a "structural" node: no station, no UI. Type
// nesting renders only between stationed types (both endpoints visible).
const visibleTypes = computed(() => new Set(screenfulTypes.value));
const panelTypes = computed(() => new Set([
  ...visibleTypes.value,
  ...orgClasses.value.map(type => type.id)
]));

const classesAvailable = computed(() => authStore.hasPermission('organizations', 'admin'));
const orgClasses = computed(() => (classesAvailable.value ? classView.types.value : [])
  .filter(type => type.scope === 'org' && type.class !== 'party' && type.id !== PAGE_TYPE_ID)
  .sort((left, right) => String(left.name || left.id).localeCompare(String(right.name || right.id))));

const classDialogVisible = ref(false);
const classDialogTypeId = ref('');
const classDialogCreate = ref(false);

function openClassDialog(typeId = '') {
  classDialogTypeId.value = typeId;
  classDialogCreate.value = !typeId;
  classDialogVisible.value = true;
}

// The PanelMenu model: type nodes become panels (their registry icon is
// PanelMenu's item icon), entity nodes become rows carrying the workspace
// item for the #item slot, the communication entries lead, and the user
// sections follow the type panels with their nested page trees; loose
// root pages render as root rows.
const sidebarMenuModel = computed(() => [
  ...communicationPanelModels(),
  ...explorerNodes.value.map(node => typePanelItem(node)),
  ...userSectionItems(),
  ...loosePageItems()
]);

// Menu selection follows the active pane's selected tab: a type screen
// selects its type panel, an instance/detail/page tab selects its entity
// row plus the owning type panel, and the chats page selects Chats. Every
// other entry renders muted (per-item classes through PanelMenu's official
// `headerClass`/`class` item channels — default rendering untouched).
const selectedMenuKeys = computed(() => {
  const item = workspaceItems.value.find(candidate => candidate.key === activeTabKey.value)
    || null;
  if (!item) return new Set();
  const keys = new Set();
  const typeId = item.typeId || item.type || null;
  if (item.kind === 'screen' && !item.instanceId && typeId) {
    keys.add(typeMenuKey(typeId));
  } else if (item.kind === 'page' && item.pageId === 'chats') {
    keys.add('communication:chats');
  } else if (item.kind === 'page' && item.pageId === 'customPage' && item.docId) {
    const page = pagesStore.pageById(item.docId);
    keys.add(page?.classTypeId ? typeMenuKey(page.classTypeId) : `${PAGE_KEY_PREFIX}${item.docId}`);
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
    // type panel never reads as one of its own rows.
    typeId: node.data.typeId,
    command: menuCommand(node.key, () => openClassPage(node.data.typeId)),
    items: (node.children || []).map(child => entityPanelItem(child))
  };
}

// PanelMenu renders the expand chevron only for items carrying non-empty
// `items`, so an expandable row whose children are not loaded yet wears a
// single invisible placeholder: the chevron exists from the start, toggling
// it drives the lazy child load, and the real rows replace the placeholder.
const pendingChildrenItem = Object.freeze({ visible: false });

function entityPanelItem(node) {
  const instanceIdValue = instanceId(node.data.item.entity);
  // The selected row carries the chrome-subtle surface; text stays at
  // the menu's muted tone.
  const selected = selectedMenuKeys.value.has(`${node.data.item.type}:${instanceIdValue}`);
  return {
    key: node.key,
    // A relation-nested row wears the link glyph — the mark that separates
    // a link from a containment child.
    icon: node.data.linked ? 'pi pi-link' : instances.iconFor(node.data.item.type),
    label: instanceLabelOf(node.data.item.type, instanceIdValue),
    class: selected ? 'rounded-ui bg-[var(--ck-chrome-subtle)]' : undefined,
    workspaceItem: node.data.item,
    command: menuCommand(node.key, () => openInstanceTab(node.data.item.type, instanceIdValue)),
    items: node.children?.length
      ? node.children.map(entityPanelItem)
      : (node.leaf === false ? [pendingChildrenItem] : undefined)
  };
}

// The communication entries in the PanelMenu: Chats opens the chats
// workspace page, and Calls toggles the CommunicationMenu flyout and
// carries active call rooms as its rows only while rooms exist.
function communicationPanelModels() {
  const rooms = activeRoomItems();
  const chatsSelected = selectedMenuKeys.value.has('communication:chats');
  return [
    {
      key: 'communication:chats',
      label: t('support.chatTitle'),
      icon: 'pi pi-comments',
      headerClass: chatsSelected ? 'rounded-ui bg-[var(--ck-chrome-subtle)]' : undefined,
      command: menuCommand('communication:chats', () => openChatsPage())
    },
    {
      key: 'communication:calls',
      label: t('call.calls'),
      icon: 'pi pi-phone',
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

// User sections and their pages (SPEC §26): a section is the sidebar's
// root grouping — a collapsible panel with nested page rows; a loose
// page (no section) renders as a root row beside the panels. Rows open
// the page as a workspace tab; context gestures author the tree.
const SECTION_KEY_PREFIX = 'page-section:';
const PAGE_KEY_PREFIX = 'custom-page:';

const userSections = computed(() => pagesStore.sections);

function sectionMenuKey(section = {}) {
  return `${SECTION_KEY_PREFIX}${section._id}`;
}

function pageMenuKey(page = {}) {
  return `${PAGE_KEY_PREFIX}${page._id}`;
}

function sectionLabel(section = {}) {
  return section.name || t('common.unnamed');
}

function pageLabel(page = {}) {
  return page?.name || t('common.unnamed');
}

function pageChildrenOf(parentId) {
  const wanted = parentId == null ? null : String(parentId);
  const pages = pagesStore.customPages || pagesStore.pages || [];
  return pages.filter(page => page.kind === 'page' && !page.classTypeId && (page.parentId ?? null) === wanted);
}

function customPageItem(page) {
  const selected = selectedMenuKeys.value.has(pageMenuKey(page));
  const children = pageChildrenOf(page._id);
  return {
    key: pageMenuKey(page),
    icon: 'pi pi-file',
    label: pageLabel(page),
    class: selected ? 'rounded-ui bg-[var(--ck-chrome-subtle)]' : undefined,
    docId: page._id,
    command: menuCommand(pageMenuKey(page), () => openCustomPageTab(page._id)),
    items: children.length ? children.map(customPageItem) : undefined
  };
}

function userSectionItems() {
  return userSections.value.map(section => ({
    key: sectionMenuKey(section),
    icon: 'pi pi-folder-open',
    label: sectionLabel(section),
    items: pageChildrenOf(section._id).map(customPageItem)
  }));
}

function loosePageItems() {
  return pageChildrenOf(null).map(customPageItem);
}

// The organization's pages load beside the process panels once the
// caller has an active organization; an organization switch refetches.
watch(() => [
  authStore.userIsSet,
  authStore.organizationData?._id || authStore.userData?.organizationId
], ([, organizationId], [, previousOrganizationId] = []) => {
  if (!authStore.userIsSet || !organizationId) return;
  if (previousOrganizationId && previousOrganizationId !== organizationId) {
    pagesStore.reload();
    return;
  }
  pagesStore.ensureLoaded();
}, { immediate: true });

async function createCustomPage(parentId = null) {
  try {
    const page = await pagesStore.createPage(parentId);
    openCustomPageTab(page._id);
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 5000 });
  }
}

const pagesContextMenu = ref(null);
const pagesMenuModel = ref([]);
const typeMenuModel = ref([]);
const typeContextMenu = ref(null);
const renameVisible = ref(false);
const renameDraft = ref('');
const renameTargetId = ref('');
const moveVisible = ref(false);
const moveTargetId = ref('');
const moveSelection = ref(null);
let sidebarLongPressTimer = null;

function pageOrSectionByKey(key = '') {
  if (key.startsWith(SECTION_KEY_PREFIX) || key.startsWith(PAGE_KEY_PREFIX)) {
    return pagesStore.pageById(key.replace(/^(page-section:|custom-page:)/, ''));
  }
  return null;
}

function onSidebarContextMenu(event) {
  const element = event.target?.closest?.('.p-panelmenu-header, .p-panelmenu-item');
  const key = element ? menuKeyForElement(element) : null;
  if (element?.classList?.contains('p-panelmenu-header') && key?.startsWith('type:')) {
    const typeId = key.slice('type:'.length);
    const record = classView.typeById(typeId);
    if (record?.scope === 'org' && typeId !== PAGE_TYPE_ID && classesAvailable.value) {
      event.preventDefault();
      event.stopPropagation();
      typeMenuModel.value = [{
        label: t('classes.editTitle'),
        icon: 'pi pi-pencil',
        command: () => openClassDialog(typeId)
      }];
      typeContextMenu.value?.show(event);
      return;
    }
  }
  const row = element ? pageOrSectionByKey(key) : null;
  if (!row) return;
  event.preventDefault();
  event.stopPropagation();
  openPagesMenu(row, event);
}

// Long-press opens the same context menu as right-click (the chat
// gesture): the press must hold past scroll intent, so any touch move
// cancels it.
function onSidebarTouchStart(event) {
  const touch = event.touches?.[0];
  if (!touch) return;
  onSidebarTouchCancel();
  sidebarLongPressTimer = setTimeout(() => {
    sidebarLongPressTimer = null;
    onSidebarContextMenu({ target: event.target, pageX: touch.pageX, pageY: touch.pageY, preventDefault: () => {}, stopPropagation: () => {} });
  }, 500);
}

function onSidebarTouchCancel() {
  if (sidebarLongPressTimer) {
    clearTimeout(sidebarLongPressTimer);
    sidebarLongPressTimer = null;
  }
}

function openPagesMenu(row, event) {
  const section = row.kind === 'section';
  pagesMenuModel.value = [
    ...(section
      ? [{ label: t('pages.newPage'), icon: 'pi pi-plus', command: () => createCustomPage(row._id) }]
      : []),
    { label: t('common.rename'), icon: 'pi pi-pencil', command: () => openRename(row) },
    ...(section ? [] : [{ label: t('pages.move'), icon: 'pi pi-arrows-alt', command: () => openMove(row) }]),
    { label: t('common.delete'), icon: 'pi pi-trash', command: () => confirmDeletePage(row) }
  ];
  pagesContextMenu.value?.show(event);
}

function openRename(row) {
  renameTargetId.value = row._id;
  renameDraft.value = row.name || '';
  renameVisible.value = true;
}

async function commitRename() {
  const name = renameDraft.value.trim();
  const id = renameTargetId.value;
  renameVisible.value = false;
  if (!id || !name) return;
  try {
    await pagesStore.rename(id, name);
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 5000 });
  }
}

// The move picker covers the organization's sections and pages plus the
// root; the moved page's own subtree stays out (the server refuses
// cycles as the authority).
const moveTreeOptions = computed(() => {
  if (!moveVisible.value) return [];
  const excluded = new Set(collectSubtreeIds(moveTargetId.value));
  const nodeFor = page => ({
    key: `move:${page._id}`,
    label: page.name || t('common.unnamed'),
    children: pagesStore.pages
      .filter(candidate => candidate.parentId === page._id && !excluded.has(candidate._id))
      .map(nodeFor)
  });
  const roots = pagesStore.pages
    .filter(page => !page.parentId && !excluded.has(page._id))
    .map(nodeFor);
  return [{ key: 'move:root', label: t('pages.root'), children: roots }];
});

function collectSubtreeIds(id = '') {
  const ids = new Set([String(id)]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const page of pagesStore.pages) {
      if (page.parentId && ids.has(String(page.parentId)) && !ids.has(page._id)) {
        ids.add(page._id);
        grew = true;
      }
    }
  }
  return [...ids];
}

function openMove(row) {
  moveTargetId.value = row._id;
  moveSelection.value = { [`move:${row.parentId || 'root'}`]: true };
  moveVisible.value = true;
}

function selectMoveKey(keys) {
  const key = keys ? Object.keys(keys).find(Boolean) : null;
  moveSelection.value = key ? { [key]: true } : null;
}

async function commitMove() {
  const selected = Object.keys(moveSelection.value || {})[0] || 'move:root';
  const parentId = selected === 'move:root' ? null : selected.replace(/^move:/, '');
  const id = moveTargetId.value;
  moveVisible.value = false;
  if (!id) return;
  try {
    await pagesStore.move(id, parentId);
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 5000 });
  }
}

function confirmDeletePage(row) {
  confirm.require({
    header: t('common.delete'),
    message: t('pages.deleteConfirm', { name: row.name || t('common.unnamed') }),
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: t('common.cancel'),
    acceptLabel: t('common.delete'),
    accept: () => deletePage(row)
  });
}

async function deletePage(row) {
  try {
    await pagesStore.remove(row._id);
    if (row.kind === 'section') {
      collapsedSectionKeys.value = collapsedSectionKeys.value.filter(key => key !== sectionMenuKey(row));
    }
    closeTabsByKey(`page:customPage:${row._id}`);
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 5000 });
  }
}

function closeTabsByKey(key) {
  openedCustomPageRefs.value = openedCustomPageRefs.value.filter(reference => reference.key !== key);
  setWorkspacePageDirty(key, false);
  closePaneTabConfirmed(key);
}

function expandSectionFromRail(section = {}) {
  sidebarCollapsed.value = false;
  collapsedSectionKeys.value = collapsedSectionKeys.value.filter(key => key !== sectionMenuKey(section));
  expandedKeys.value = { ...expandedKeys.value, [sectionMenuKey(section)]: true };
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
  // A type nested under another stationed type through the containment
  // graph never panels on its own: its instances live beneath their
  // parent instances, so a root panel beside the parent's would duplicate
  // the whole subtree. The menu renders panels for un-nested types and
  // classes — instance rows beneath stationed types, the class dialog
  // beneath classes without a screen.
  const nestedTypes = new Set();
  for (const triple of effectiveContainment()) {
    if (triple.childType === triple.parentType) continue;
    if (!panelTypes.value.has(triple.childType) || !panelTypes.value.has(triple.parentType)) continue;
    nestedTypes.add(triple.childType);
  }
  return [...panelTypes.value]
    .filter(typeId => !nestedTypes.has(typeId))
    .map(typeId => typeNode(typeId))
    .sort((a, b) => a.label.localeCompare(b.label));
});

function typeNode(typeId) {
  const section = sections.value.find(candidate => candidate.source.typeId === typeId);
  const sectionInstances = section ? sectionItemsFor(section.region.id) : [];
  return {
    key: typeMenuKey(typeId),
    label: typeLabelOf(typeId),
    icon: classView.typeById(typeId)?.glyph || instances.iconFor(typeId),
    selectable: true,
    data: { typeId, section },
    leaf: !sectionInstances.length,
    children: sectionInstances.map(item => entityNode(item))
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

function openMobileInstance({ typeId, instanceId } = {}) {
  routeInstanceToScreen(typeId, instanceId);
}

function typeLabelOf(typeId = '') {
  const record = classView.typeById(typeId) || registryStore.typeRecord(typeId);
  // Procedural label contract only: the generated type key (locale
  // override) over the authored type name — no entity contracts, no raw
  // ids.
  if (!record) return typeId;
  return localizedLabel({ te, t }, typeLabelKey(typeId), record.name || '');
}

function screenLabelFor(screenKey = '') {
  const screen = screenByKey(authStore.screenManifest || [], screenKey);
  return localizedLabel({ te, t }, screen?.typeId ? typeLabelKey(screen.typeId) : '', screen?.label || screen?.typeId || screenKey);
}

// Blank editor tabs label from the page registry's locale key — there is
// no record to title from until the first save creates it.
function workspacePageLabel(pageId = '') {
  const page = generatedWorkspacePages().find(candidate => candidate.id === pageId);
  return localizedLabel({ te, t }, page?.labelKey || '', pageId);
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
// list screen) second. Types with no compiled detail screen but a bound
// editor surface open that editor page as the pane tab — the record
// surface of a type without a compiled screen (SPEC §4: the editor is
// the record surface); types with no compiled screen, no editor, but a
// registered entity-bound workspace page (the directory surface for
// `user`/`organization`) open that page; a type with none of the three
// stays silent, exactly like the routed surface contract.
function openInstanceTab(typeId = '', instanceIdValue = '') {
  if (!typeId || !instanceIdValue || !workspaceDock.value) return;
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
    openWorkspaceTab(key);
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

// Sections follow the type-panel law: auto-expand on first sight, honor
// an explicit collapse. A collapse recorded in expandedKeys lands in the
// persisted set; re-expanding drops it again.
watch(userSections, value => {
  const next = { ...expandedKeys.value };
  for (const section of value) {
    const key = sectionMenuKey(section);
    if (!(key in next) && !collapsedSectionKeys.value.includes(key)) next[key] = true;
  }
  expandedKeys.value = next;
}, { immediate: true });

watch(expandedKeys, (next, previous = {}) => {
  for (const section of userSections.value) {
    const key = sectionMenuKey(section);
    if (key in next && key in previous && next[key] !== previous[key]) {
      collapsedSectionKeys.value = next[key]
        ? collapsedSectionKeys.value.filter(candidate => candidate !== key)
        : [...new Set([...collapsedSectionKeys.value, key])];
    }
  }
});

// Active rooms must be visible the moment they exist: the Calls entry
// carries them as rows, so it auto-expands on the empty-to-active
// transition (initial load included); an explicit collapse while calls
// run stays respected until the next call starts.
watch(() => callsStore.activeRooms.length, (count, previous = 0) => {
  if (count > 0 && previous === 0) {
    expandedKeys.value = { ...expandedKeys.value, 'communication:calls': true };
  }
}, { immediate: true });

// Tabs can outlive their type (registry churn rewrites type ids): a dead
// reference drops on restore instead of rendering an id-fallback row and
// hammering an unknown collection with 404s.
const resolvableTabKeys = computed(() => new Set([
  ...openedScreenRefs.value.map(reference => reference.key),
  ...openedPageRefs.value.map(reference => reference.key),
  ...openedCustomPageRefs.value.map(reference => reference.key),
  ...openedChatRefs.value.map(reference => reference.key),
  ...callPageRefs.value.map(reference => reference.key),
  ...staticPageItems.value.map(item => item.key),
  ...customPageItems.value.map(item => item.key),
  ...chatPageItems.value.map(item => item.key),
  ...workspaceTabItems.value.map(item => item.key)
]));

function isTabResolvable(key) {
  return isEmptyTabKey(key) || resolvableTabKeys.value.has(key);
}

// Post-mount only (contract: components/generated/README.md)
function applyPersistedWorkspaceState(key) {
  if (!key) return;
  const state = loadHomeWorkspaceState(window.localStorage, key);
  openedEntityRefs.value = (state.openedEntityRefs || [])
    .filter(reference => registryStore.typeRecord(reference.typeId));
  openedPageRefs.value = state.openedPageRefs || [];
  openedScreenRefs.value = state.openedScreenRefs || [];
  openedCustomPageRefs.value = state.openedCustomPageRefs || [];
  openedChatRefs.value = state.openedChatRefs || [];
  sidebarCollapsed.value = Boolean(state.sidebarCollapsed);
  collapsedSectionKeys.value = state.collapsedSectionKeys || [];
  paneHistories.value = new Map();
  pendingLayout = pruneDockLayout(state.layout, isTabResolvable);
  pendingActiveKey = state.pendingActiveKey || '';
  pendingTabKeys = state.pendingTabKeys || [];
  hydratedStorageKey.value = key;
  layoutHydrated = false;
  if (dockReady.value) applyPendingWorkspaceLayout();
}

function applyPendingWorkspaceLayout() {
  const dock = workspaceDock.value;
  if (!dock) return;
  if (pendingLayout) {
    dock.applyLayout(pendingLayout);
    nextTick(() => dock.ensureEmptyPanel());
  } else if (pendingTabKeys.length) {
    const keys = pendingTabKeys.filter(key => isTabResolvable(key) && !isEmptyTabKey(key));
    const activeKey = keys.includes(pendingActiveKey) ? pendingActiveKey : keys.at(-1);
    keys.forEach(key => dock.openPanel(key, { newTab: true }));
    if (activeKey) dock.focusPanel(activeKey);
    if (!keys.length) dock.ensureEmptyPanel();
  } else {
    dock.ensureEmptyPanel();
  }
  pendingLayout = null;
  pendingTabKeys = [];
  pendingActiveKey = '';
  layoutHydrated = true;
  schedulePersistWorkspaceState();
  flushPendingCallTab();
}

function onDockReady() {
  dockReady.value = true;
  if (!isWorkspaceMounted) return;
  if (hydratedStorageKey.value === workspaceStorageKey.value) applyPendingWorkspaceLayout();
  else applyPersistedWorkspaceState(workspaceStorageKey.value);
}

function onDockActiveChange({ groupId, panelId }) {
  activeGroupId.value = groupId || '';
  activeTabKey.value = panelId || '';
}

function onDockLayoutChange(layout) {
  dockLayout.value = layout;
  schedulePersistWorkspaceState();
}

let persistTimer = null;
function schedulePersistWorkspaceState() {
  if (typeof window === 'undefined') return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistWorkspaceState();
  }, 200);
}

function flushWorkspacePersistence() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  persistWorkspaceState();
}

function persistWorkspaceState() {
  const key = workspaceStorageKey.value;
  if (!key || !layoutHydrated || hydratedStorageKey.value !== key || typeof window === 'undefined') return;
  saveHomeWorkspaceState(window.localStorage, key, {
    layout: workspaceDock.value?.snapshot() || dockLayout.value,
    openedEntityRefs: openedEntityRefs.value,
    openedPageRefs: openedPageRefs.value,
    openedScreenRefs: openedScreenRefs.value,
    openedCustomPageRefs: openedCustomPageRefs.value,
    openedChatRefs: openedChatRefs.value,
    sidebarCollapsed: sidebarCollapsed.value,
    collapsedSectionKeys: collapsedSectionKeys.value
  });
}

onMounted(() => {
  isWorkspaceMounted = true;
  applyPersistedWorkspaceState(workspaceStorageKey.value);
  queueOrOpenCallTab(callsStore.pendingTabRoom);
  window.addEventListener('pagehide', flushWorkspacePersistence);
});

watch(workspaceStorageKey, key => {
  if (key && isWorkspaceMounted && hydratedStorageKey.value !== key) applyPersistedWorkspaceState(key);
});

watch(
  [openedEntityRefs, openedPageRefs, openedScreenRefs, openedCustomPageRefs, openedChatRefs, sidebarCollapsed, collapsedSectionKeys],
  () => persistWorkspaceState(),
  { deep: true }
);

watch(openedEntityRefs, async refs => {
  const sequence = ++openedEntityLoadSequence;
  const loaded = await Promise.all(refs.map(async reference => {
    // Persisted tabs can outlive their type (registry churn): a dead
    // typeId has no collection to read and only produces 404 noise —
    // it drops here instead of hydrating. Corrupted persisted ids (the
    // literal "null"/"undefined" strings an older persistence bug could
    // write) drop with them instead of reaching the directory fallback.
    const persistedId = String(reference.instanceId || '');
    if (!registryStore.typeRecord(reference.typeId)) return null;
    if (!persistedId || /^(null|undefined)$/.test(persistedId)) return null;
    const existing = workspaceEntityItems.value.find(item => (
      item.type === reference.typeId && instanceId(item.entity) === reference.instanceId
    ));
    const entity = existing?.entity
      || await instances.resolveReadableReference(instances.canonicalTypeKey(reference.typeId), persistedId, { silent: true });
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
// home workspace navigates here to open the tab; the mounted panel consumes
// the pending room, so the floating-window auto-rule stays suspended until
// a surface truly exists.
watch(() => callsStore.pendingTabRoom, room => queueOrOpenCallTab(room), { immediate: true });

// Desktop instance links open as compiled detail-screen tabs: live events
// while the home workspace is mounted, pending requests (stashed before
// navigating home) consumed on mount. Mobile viewports have no panes: the
// directory types open as the bounded home dialog instead (entity types
// with a compiled detail screen keep the routed mobile contract).
function openRequestedWorkspaceEntity(event) {
  event?.preventDefault?.();
  const { typeId, instanceId } = event?.detail || {};
  if (!typeId || !instanceId) return;
  if (isMobileViewport.value) {
    if (routeInstanceToScreen(typeId, instanceId)) return;
    // The active organization's real page is the org overview system
    // screen — the directory profile popup is for other records.
    if (typeId === 'organization' && isActiveOrganization(instanceId)) {
      navigateTo(organizationOverviewRoute());
      return;
    }
    entityPopup.open({ typeId, instanceId: String(instanceId) });
    return;
  }
  openInstanceTab(typeId, instanceId);
}

function isActiveOrganization(instanceId = '') {
  const activeId = authStore.organizationData?._id || authStore.userData?.organizationId || '';
  return Boolean(activeId) && String(instanceId) === String(activeId);
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
  window.removeEventListener('pagehide', flushWorkspacePersistence);
  flushWorkspacePersistence();
  // Route leave: the workspace's call tabs go with it and the
  // floating-window rule takes the sessions (components/calls README).
  callsStore.resetCallTabs();
});

const resolveRoomLabel = useCallRoomLabel();
function activeRoomLabel(room = {}) {
  return resolveRoomLabel(room.room, t('call.activeRoom'));
}

// Calls open as ephemeral workspace tabs (never persisted with the pane
// layout): the tab hosts the LiveKit stage plus the conversation chat rail.
const callPageRefs = ref([]);

// Find-or-register a tab reference, refresh its live label, and select
// it as a new tab.
function openEphemeralTab(refs, record) {
  const existing = refs.value.find(item => item.key === record.key);
  if (existing) {
    if (record.label && existing.label !== record.label) existing.label = record.label;
  } else {
    refs.value = [...refs.value, record];
  }
  openWorkspaceTab(record.key, { newTab: true });
}

// Custom page tabs: one tab per page document; labels resolve live from
// the pages store, so renames reach open tabs without refresh.
const customPageItems = computed(() => openedCustomPageRefs.value.map(reference => ({
  key: reference.key,
  kind: 'page',
  pageId: 'customPage',
  docId: reference.docId,
  label: pageLabel(pagesStore.pageById(reference.docId))
})));

async function openClassPage(typeId = '') {
  if (!typeId) return;
  try {
    const page = await pagesStore.ensureClassPage(typeId, typeLabelOf(typeId));
    if (page?._id) openCustomPageTab(page._id);
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 5000 });
  }
}

function openCustomPageTab(docId = '') {
  if (!docId) return;
  openEphemeralTab(openedCustomPageRefs, { key: `page:customPage:${docId}`, docId });
}

function openChatTab(conversationKey = '', label = '') {
  openEphemeralTab(openedChatRefs, {
    key: conversationKey ? `page:chat:${conversationKey}` : 'page:chats',
    conversationKey,
    label
  });
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
  const { pageId, entity, typeId, params } = event?.detail || {};
  if (!pageId) return;
  openWorkspacePage({ pageId, entity, typeId, params });
}

function queueOrOpenCallTab(room = '') {
  if (!room) return;
  const request = { room, conversationKey: conversationKeyForRoom(room) };
  if (dockReady.value && hydratedStorageKey.value && hydratedStorageKey.value === workspaceStorageKey.value) openCallTab(room, request);
  else pendingCallTab = request;
}

function flushPendingCallTab() {
  if (!pendingCallTab) return;
  const request = pendingCallTab;
  pendingCallTab = null;
  openCallTab(request.room, request);
}

function openCallTab(room = '', meta = {}) {
  if (!room) return;
  // An open call tab seats the session even while inactive: the pane
  // renders the selected tab only, so the tab — not the mounted panel —
  // is the session's workspace surface (components/calls README).
  openEphemeralTab(callPageRefs, {
    key: room,
    room,
    conversationKey: meta.conversationKey || '',
    label: typeof meta.label === 'string' ? meta.label : ''
  });
  callsStore.tabOpened(room);
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

function entityNode(item, { linked = false } = {}) {
  const declaredChildren = effectiveContainment().some(relation => (
    relation.parentType === item.type
  ));
  const contained = workspaceEntityItems.value.filter(candidate => (
    childrenByKey.value.get(candidate.key) === item.key
  ));
  const containedKeys = new Set(contained.map(child => child.key));
  const linkedChildren = (linkedChildrenByKey.value.get(item.key) || [])
    .map(key => workspaceEntityItems.value.find(candidate => candidate.key === key))
    .filter(Boolean)
    .filter(candidate => !containedKeys.has(candidate.key));
  const expandable = declaredChildren || hasRelationRefs(item.entity) || contained.length + linkedChildren.length > 0;
  return {
    key: item.key,
    // The inline entity chip owns the entity icon; a tree-level icon would
    // duplicate it.
    data: { item, linked },
    leaf: !expandable,
    children: contained.length + linkedChildren.length
      ? [
          ...contained.map(child => entityNode(child)),
          ...linkedChildren.map(child => entityNode(child, { linked: true }))
        ]
      : undefined
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
      // the list DTO stays the source when the full record cannot load
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

function openWorkspaceTab(key, options = {}) {
  const dock = workspaceDock.value;
  if (!dock) return;
  if (!isEmptyTabKey(key) && !isTabResolvable(key)) return;
  if (isReplacingSelection(key, options)) {
    pushPaneHistory(activeGroupId.value, activeTabKey.value);
  }
  dock.openPanel(key, options);
}

// A selection replaces the pane's content in place when it is real
// content the pane does not already hold, superseding real content
// (empty placeholders exist to be filled — consuming one is not
// navigation). Tab switches between already-open tabs are not
// navigation either.
function isReplacingSelection(key, options = {}) {
  return !options.newTab
    && !options.back
    && !isEmptyTabKey(key)
    && !isEmptyTabKey(activeTabKey.value)
    && key !== activeTabKey.value
    && !workspaceDock.value?.hasPanel(key);
}

function pushPaneHistory(groupId, key) {
  if (!groupId || !key) return;
  const stack = paneHistories.value.get(groupId) || [];
  paneHistories.value = new Map([...paneHistories.value, [
    groupId,
    [...stack, key].slice(-PANE_HISTORY_LIMIT)
  ]]);
}

function paneHasHistory(groupId) {
  return (paneHistories.value.get(groupId) || []).length > 0;
}

// Back walks the stack to the last entry whose content still resolves —
// a closed-and-forgotten tab's key is skipped, not restored.
function goBackFromPane(groupId) {
  const dock = workspaceDock.value;
  if (!dock) return;
  const stack = [...(paneHistories.value.get(groupId) || [])];
  while (stack.length) {
    const key = stack.pop();
    paneHistories.value = new Map([...paneHistories.value, [groupId, stack]]);
    if (isTabResolvable(key)) {
      dock.replaceActive(groupId, key);
      return;
    }
  }
  paneHistories.value = new Map([...paneHistories.value, [groupId, []]]);
}

function openEmptyPaneTab(groupId = '') {
  const dock = workspaceDock.value;
  if (!dock) return;
  const group = groupId ? dock.groupById(groupId) : null;
  dock.addPanel(emptyTabKey(), group ? { referenceGroup: group } : {});
}

function closePaneTab(key) {
  if (isWorkspacePageDirty(key)) {
    confirm.require({
      header: t('common.unsavedChanges'),
      message: t('common.unsavedChangesMessage'),
      icon: 'pi pi-exclamation-triangle',
      rejectLabel: t('common.stay'),
      acceptLabel: t('common.discard'),
      accept: () => closePaneTabConfirmed(key)
    });
    return;
  }
  closePaneTabConfirmed(key);
}

function closePaneTabConfirmed(key) {
  const dock = workspaceDock.value;
  if (!dock?.hasPanel(key)) return;
  dock.removePanel(key);
  forgetClosedTabRefs(key);
}

// Tab references (pages, screens, call stages) die with their last tab:
// once no dock panel carries the closed key, its refs are forgotten.
function forgetClosedTabRefs(key) {
  if (workspaceDock.value?.hasPanel(key)) return;
  setWorkspacePageDirty(key, false);
  openedPageRefs.value = openedPageRefs.value.filter(reference => reference.key !== key);
  openedScreenRefs.value = openedScreenRefs.value.filter(reference => reference.key !== key);
  if (callPageRefs.value.some(call => call.key === key)) callsStore.tabClosed(key);
  callPageRefs.value = callPageRefs.value.filter(call => call.key !== key);
  openedCustomPageRefs.value = openedCustomPageRefs.value.filter(reference => reference.key !== key);
  openedChatRefs.value = openedChatRefs.value.filter(reference => reference.key !== key);
}

function splitPane(groupId, orientation) {
  workspaceDock.value?.splitGroup(groupId, orientation);
}

function closePane(groupId) {
  const dock = workspaceDock.value;
  if (!dock || dock.groups().length <= 1) return;
  const keys = dock.panelIdsInGroup(groupId);
  const dirtyKeys = keys.filter(isWorkspacePageDirty);
  if (dirtyKeys.length) {
    confirm.require({
      header: t('common.unsavedChanges'),
      message: t('common.unsavedChangesMessage'),
      icon: 'pi pi-exclamation-triangle',
      rejectLabel: t('common.stay'),
      acceptLabel: t('common.discard'),
      accept: () => closePaneConfirmed(groupId, keys)
    });
    return;
  }
  closePaneConfirmed(groupId, keys);
}

function closePaneConfirmed(groupId, keys = []) {
  workspaceDock.value?.removeGroup(groupId);
  keys.forEach(forgetClosedTabRefs);
  paneHistories.value = new Map([...paneHistories.value].filter(([id]) => id !== groupId));
}

function openWorkspaceEntity(typeId, entity) {
  // Explorer hydration entry: remembers the record for the tree (nesting,
  // editor-page entities) and opens its record surface tab.
  const item = rememberWorkspaceEntity(typeId, entity);
  if (!item) return null;
  openInstanceTab(typeId, instanceId(item.entity));
  return item;
}

function openWorkspacePage(request = {}) {
  const definition = resolveGeneratedWorkspacePage(request.pageId);
  if (!definition) return;
  if (!definition.typeId) {
    if (request.params) {
      pageParamsByKey.value = { ...pageParamsByKey.value, [`page:${definition.id}`]: request.params };
    }
    openWorkspaceTab(`page:${definition.id}`);
    return;
  }
  if (definition.typeId !== request.typeId) return;

  // The blank editor page (SPEC §UI): no record yet — the first save
  // creates it. A singleton entity-less tab per surface.
  if (!instanceId(request.entity)) {
    const blankKey = `page:${definition.id}`;
    if (!openedPageRefs.value.some(page => page.key === blankKey)) {
      openedPageRefs.value = [...openedPageRefs.value, {
        key: blankKey,
        pageId: definition.id,
        typeId: definition.typeId,
        instanceId: ''
      }];
    }
    openWorkspaceTab(blankKey);
    return;
  }

  rememberWorkspaceEntity(request.typeId, request.entity);

  const entityItem = workspaceEntityItems.value.find(item => (
    item.type === definition.typeId
    && instanceId(item.entity) === instanceId(request.entity)
  ));
  if (!entityItem) return;

  const key = workspacePageKey(definition.id, entityItem.entity);
  if (!openedPageRefs.value.some(page => page.key === key)) {
    openedPageRefs.value = [...openedPageRefs.value, {
      key,
      pageId: definition.id,
      typeId: definition.typeId,
      instanceId: instanceId(entityItem.entity)
    }];
  }
  openWorkspaceTab(key);
}

function rememberWorkspaceEntity(typeId, entity) {
  const id = instanceId(entity);
  if (!typeId || !id) return null;
  const key = entityKey(typeId, entity);
  const existing = workspaceEntityItems.value.find(item => item.key === key);
  if (existing) {
    hydrateWorkspaceEntityItem(existing);
    return existing;
  }

  const item = workspaceEntityItem(typeId, entity);
  openedEntityItems.value = [...openedEntityItems.value, item];
  if (!openedEntityRefs.value.some(reference => reference.key === key)) {
    openedEntityRefs.value = [...openedEntityRefs.value, {
      key,
      typeId,
      instanceId: id
    }];
  }
  hydrateWorkspaceEntityItem(item);
  return item;
}

// Opened-entity items carry the real record, never a bare id stub: editor
// pages render `page.entity` and the explorer nests over lineage, while
// create-opens arrive with only the created id. A record already in the
// pool replaces the stub immediately; anything else fetches once and
// lands reactively.
function hydrateWorkspaceEntityItem(item) {
  const typeKey = instances.canonicalTypeKey(item.type);
  const id = instanceId(item.entity);
  if (!typeKey || !id) return;
  if (item.entity && item.entity.name !== undefined) return;
  const pooled = instances.recordFor(typeKey, id)?.dto;
  if (pooled && pooled.name !== undefined) {
    item.entity = pooled;
    return;
  }
  instances.fetchInstance(typeKey, id).then(fetched => {
    if (fetched && instanceId(fetched) === id && fetched.name !== undefined) item.entity = fetched;
  }).catch(() => {});
}

function workspaceTabLabel(item) {
  if (!item) return '';
  if (item.kind === 'screen') return item.label || item.screenKey || item.key;
  if (item.kind === 'page') {
    if (item.pageId === 'customPage') return pageLabel(pagesStore.pageById(item.docId));
    if (item.pageId === 'chats' && item.conversationKey) return chatTabLabel(item);
    if (item.label) return item.label;
    if (item.typeId) return instanceLabelOf(item.typeId, item.instanceId || instanceId(item.entity));
    const definition = resolveGeneratedWorkspacePage(item.pageId);
    return definition ? t(definition.labelKey) : item.key;
  }
  if (item.kind === 'instance') return instanceLabelOf(item.type, instanceId(item.entity));
  return item.label || item.key;
}

function workspaceTabIcon(item) {
  if (!item) return '';
  if (item.kind === 'screen' || item.kind === 'instance') {
    return instances.iconFor(item.typeId || item.type) || 'pi pi-file';
  }
  if (item.typeId) {
    const glyph = registryStore.typeRecord(item.typeId)?.glyph;
    if (glyph) return glyph;
  }
  return resolveGeneratedWorkspacePage(item.pageId)?.icon || item.icon || 'pi pi-file';
}

function chatTabLabel(item = {}) {
  const conversation = (supportChatStore.conversations || [])
    .find(candidate => candidate.conversationKey === item.conversationKey);
  return conversation?.groupName
    || conversation?.participant?.identity?.name
    || item.label
    || t('support.chatTitle');
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

