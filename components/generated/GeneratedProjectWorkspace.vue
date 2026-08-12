<template>
  <div v-if="project" class="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-workspace">
    <header
      class="flex h-10 shrink-0 items-center gap-1 border-b [border-color:var(--ck-chrome-border)] bg-chrome px-1 text-[var(--ck-chrome-foreground)]"
      data-project-actions-strip
    >
      <Button
        class="hidden lg:inline-flex"
        :icon="explorerOpen ? 'pi pi-angle-double-left' : 'pi pi-angle-double-right'"
        text
        rounded
        size="small"
        severity="secondary"
        :aria-label="$t(explorerOpen ? 'project.collapseExplorer' : 'project.expandExplorer')"
        @click="explorerOpen = !explorerOpen"
      />
      <GeneratedProjectActionPalette
        :action-entries="projectActions"
        @execute-action="executeWorkspaceAction"
      />
      <Button icon="pi pi-window-maximize" text rounded size="small" severity="secondary" :aria-label="$t('project.workspaceLayouts')" v-tooltip.bottom="$t('project.workspaceLayouts')" @click="layoutPresetsVisible = true" />
      <Button icon="pi pi-search" text rounded size="small" severity="secondary" :aria-label="$t('project.quickOpen')" v-tooltip.bottom="$t('project.quickOpen')" @click="quickOpenVisible = true" />
    </header>

    <div class="min-h-0 flex-1 overflow-hidden">
      <Splitter
        :gutter-size="1"
        :pt="workspaceSplitterPt"
        class="hidden h-full min-h-0 !border-0 lg:flex"
        @resizeend="resizeWorkspaceShell"
      >
        <SplitterPanel
          key="workspace-explorer"
          :size="explorerSize"
          :min-size="10"
          :class="['min-h-0 min-w-0 overflow-hidden !border-0', { '!hidden': !explorerOpen }]"
        >
          <section class="project-explorer flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-pane">
            <Tree
              v-model:selection-keys="selectionKeys"
              v-model:expanded-keys="expandedKeys"
              :value="explorerNodes"
              selection-mode="single"
              :aria-label="$t('project.explorer')"
              class="project-explorer-tree min-h-0 min-w-0 max-w-full flex-1 overflow-x-hidden overflow-y-auto !border-0 !p-0"
              :pt="explorerTreePt"
              @node-select="selectNode"
            >
              <template #default="{ node }">
                <div v-if="node.data?.item?.kind === 'entity'" class="flex min-w-0 max-w-full flex-1 items-center gap-1 overflow-hidden" data-explorer-entity>
                  <IdentityBlock :entity="node.data.item.entity" variant="compact" class="min-w-0 flex-1" />
                  <EntityActionsPopover v-if="explorerEntityCanDelete(node.data.item)">
                    <GeneratedDeleteButton
                      :entity="node.data.item.entity"
                      :entity-type="node.data.item.type"
                      menu-item
                      @deleted="handleExplorerEntityDeleted(node.data.item)"
                    />
                  </EntityActionsPopover>
                </div>
                <div v-else class="flex min-w-0 flex-1 items-center gap-2">
                  <span class="min-w-0 flex-1 truncate">{{ node.label }}</span>
                </div>
              </template>
            </Tree>
          </section>
        </SplitterPanel>

        <SplitterPanel
          key="workspace-content"
          :size="100 - explorerSize"
          :min-size="30"
          class="min-h-0 min-w-0 overflow-hidden !border-0"
        >
          <WorkspaceSplitNode
            :node="displayedPaneTree"
            :active-pane-id="activePaneId"
            @activate="activatePane"
            @resize="resizePaneSplit"
          >
            <template #default="{ pane }">
              <GeneratedWorkspacePane
                :item="itemForPane(pane)"
                :tabs="tabItemsForPane(pane)"
                :available-tabs="workspaceItems"
                :dirty-tab-keys="dirtyTabKeys"
                :pane-id="pane.id"
                :action-entries="actionEntriesForPane(pane)"
                :closeable="paneCount > 1"
                :maximizable="paneCount > 1"
                :maximized="maximizedPaneId === pane.id"
                :can-reopen="recentlyClosedRefs.length > 0"
                @execute-action="executeWorkspaceAction"
                @open-entity="openWorkspaceEntity"
                @open-page="openWorkspacePage"
                @refresh="$emit('refresh')"
                @dirty-change="updateFileDirty"
                @reorder-tab="payload => reorderPaneTab(pane.id, payload)"
                @move-tab="movePaneTab"
                @toggle-maximize="togglePaneMaximize(pane.id)"
                @reopen="reopenLastClosed(pane.id)"
                @select-tab="key => selectPaneTab(pane.id, key)"
                @close-tab="key => closePaneTab(pane.id, key)"
                @add-tab="key => selectPaneTab(pane.id, key)"
                @split="orientation => splitPane(pane.id, orientation)"
                @close="closePane(pane.id)"
              />
            </template>
          </WorkspaceSplitNode>
        </SplitterPanel>
      </Splitter>

      <div class="flex h-full min-h-0 flex-col lg:hidden">
        <div class="shrink-0 border-b border-content-border p-1">
          <EntitySelect
            v-model="mobileSelectedKey"
            :options="mobileWorkspaceOptions"
            option-label="label"
            option-value="value"
            class="w-full"
            @update:model-value="selectByKey"
          />
        </div>
        <GeneratedWorkspacePane
          class="min-h-0 flex-1"
          :item="itemForPane(activePane)"
          :tabs="tabItemsForPane(activePane)"
          :available-tabs="workspaceItems"
          :dirty-tab-keys="dirtyTabKeys"
          :pane-id="activePane?.id || ''"
          :action-entries="actionEntriesForPane(activePane)"
          :splittable="false"
          :maximizable="false"
          :can-reopen="recentlyClosedRefs.length > 0"
          @execute-action="executeWorkspaceAction"
          @open-entity="openWorkspaceEntity"
          @open-page="openWorkspacePage"
          @refresh="$emit('refresh')"
          @dirty-change="updateFileDirty"
          @reorder-tab="payload => reorderPaneTab(activePane.id, payload)"
          @move-tab="movePaneTab"
          @reopen="reopenLastClosed(activePane.id)"
          @select-tab="key => selectPaneTab(activePane.id, key)"
          @close-tab="key => closePaneTab(activePane.id, key)"
          @add-tab="key => selectPaneTab(activePane.id, key)"
        />
      </div>
    </div>
    <Dialog v-model:visible="quickOpenVisible" modal :header="$t('project.quickOpen')" class="w-full max-w-lg">
      <div class="flex flex-col gap-2">
        <InputText v-model="quickOpenQuery" autofocus :placeholder="$t('project.quickOpenPlaceholder')" />
        <Button v-for="item in quickOpenItems" :key="item.key" :label="item.label" :icon="item.icon" text class="w-full justify-start" @click="openQuickItem(item.key)" />
      </div>
    </Dialog>
    <Dialog v-model:visible="layoutPresetsVisible" modal :header="$t('project.workspaceLayouts')" class="w-full max-w-lg">
      <div class="flex flex-col gap-3">
        <p class="m-0 text-sm text-muted-color">{{ $t('project.workspaceLayoutsHelp') }}</p>
        <div class="flex gap-2">
          <InputText v-model="layoutPresetNameDraft" class="min-w-0 flex-1" :placeholder="$t('project.workspaceLayoutName')" @keydown.enter.prevent="saveWorkspaceLayoutPreset" />
          <Button :label="$t('project.saveLayout')" icon="pi pi-save" size="small" :disabled="!layoutPresetNameDraft.trim()" @click="saveWorkspaceLayoutPreset" />
        </div>
        <div v-if="layoutPresets.length" class="flex flex-col gap-1">
          <div v-for="preset in layoutPresets" :key="preset.id" class="flex min-w-0 items-center gap-1 rounded-ui border border-content-border px-2 py-1">
            <span class="min-w-0 flex-1 truncate text-sm">{{ preset.name }}</span>
            <Button :label="$t('project.applyLayout')" text size="small" @click="applyWorkspaceLayoutPreset(preset)" />
            <Button icon="pi pi-pencil" text rounded size="small" severity="secondary" :aria-label="$t('project.renameLayout')" v-tooltip.top="$t('project.renameLayout')" @click="renameWorkspaceLayoutPreset(preset)" />
            <Button icon="pi pi-trash" text rounded size="small" severity="danger" :aria-label="$t('project.deleteLayout')" v-tooltip.top="$t('project.deleteLayout')" @click="deleteWorkspaceLayoutPreset(preset.id)" />
          </div>
        </div>
        <Message v-else severity="secondary" :closable="false">{{ $t('project.noWorkspaceLayouts') }}</Message>
        <Button :label="$t('project.resetWorkspaceLayout')" icon="pi pi-refresh" severity="secondary" text size="small" class="self-start" @click="resetWorkspaceLayout" />
      </div>
    </Dialog>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Splitter from 'primevue/splitter';
import SplitterPanel from 'primevue/splitterpanel';
import Tree from 'primevue/tree';
import { useI18n } from 'vue-i18n';
import EntitySelect from '~/components/shared/EntitySelect.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import EntityActionsPopover from '~/components/shared/EntityActionsPopover.vue';
import WorkspaceSplitNode from '~/components/shared/WorkspaceSplitNode.vue';
import GeneratedProjectActionPalette from '~/components/generated/GeneratedProjectActionPalette.vue';
import GeneratedDeleteButton from '~/components/generated/GeneratedDeleteButton.vue';
import GeneratedWorkspacePane from '~/components/generated/GeneratedWorkspacePane.vue';
import { actionAppliesToEntity, isGeneratedSurfaceAction } from '~/components/generated/action-visibility.js';
import { mergeCollectionActionContext } from '~/components/generated/action-context.js';
import { projectContextActionEntries } from '~/components/generated/project-context-actions.js';
import { resolveGeneratedWorkspacePage } from '~/components/generated/workspace-pages.js';
import { useAuthStore } from '~/stores/auth';
import { useEntityStore } from '~/stores/entities.js';
import { useCutkitDomainUi } from '~/composables/useCutkitDomainUi.js';
import { useEffectiveContainment } from '~/composables/useEffectiveContainment.js';
import { generatedEntityLabel } from '~/utils/generated-labels.js';
import { resolveEntityRelationRefs } from '~/utils/entity-relations.js';
import { canDeleteGeneratedEntity } from '~/components/generated/delete-visibility.js';
import { projectExplorerHierarchy } from '~/utils/project-explorer-hierarchy.js';
import { workspaceFilePresentation } from '~/utils/workspace-file-presentation.js';
import {
  closeWorkspaceLeaf,
  createWorkspaceLeaf,
  splitWorkspaceLeaf,
  updateWorkspaceLeaf,
  updateWorkspaceSplit,
  workspaceLeaves
} from '~/utils/workspace-splits.js';
import {
  loadProjectWorkspaceState,
  projectWorkspaceStorageKey,
  saveProjectWorkspaceState,
  workspaceLayoutPresetFromState
} from '~/utils/project-workspace-state.js';

const props = defineProps({
  screen: { type: Object, required: true },
  sourceState: { type: Function, required: true },
  screenActions: { type: Array, default: () => [] }
});

const emit = defineEmits(['refresh', 'execute-action']);
const authStore = useAuthStore();
const entityStore = useEntityStore();
const domainUi = useCutkitDomainUi();
const effectiveContainment = useEffectiveContainment();
const { t, te } = useI18n();
const explorerOpen = ref(true);
const explorerSize = ref(15);
const selectionKeys = ref({});
const expandedKeys = ref({});
const mobileSelectedKey = ref('');
const activePaneId = ref('pane-1');
const paneSequence = ref(1);
const paneTree = ref(createWorkspaceLeaf('pane-1'));
const openedEntityRefs = ref([]);
const openedPageRefs = ref([]);
const linkedEntityItems = ref([]);
const openedEntityItems = ref([]);
const dirtyFileKeys = ref(new Set());
const maximizedPaneId = ref('');
const recentlyClosedRefs = ref([]);
const layoutPresets = ref([]);
const quickOpenVisible = ref(false);
const quickOpenQuery = ref('');
const layoutPresetsVisible = ref(false);
const layoutPresetNameDraft = ref('');
const hydratedStorageKey = ref('');
let openedEntityLoadSequence = 0;
const explorerTreePt = {
  root: { class: '!min-w-0 !max-w-full !overflow-hidden' },
  node: { class: '!min-w-0 !max-w-full !overflow-hidden' },
  nodeContent: { class: '!min-w-0 !max-w-full !overflow-hidden !px-1 !py-0.5 !gap-1' },
  nodeLabel: { class: '!min-w-0 !overflow-hidden' },
  nodeToggleButton: { class: '!h-6 !w-6' }
};
const workspaceSplitterPt = computed(() => ({
  gutter: { class: explorerOpen.value ? '' : '!hidden' }
}));

const regions = computed(() => props.screen.regions || []);
const mainRegion = computed(() => regions.value.find(region => sourceStateForRegion(region).source?.mode === 'single') || regions.value[0] || null);
const project = computed(() => mainRegion.value ? sourceStateForRegion(mainRegion.value).entity : null);
provide('displayedEntityContexts', computed(() => project.value ? [{ type: 'project', entity: project.value }] : []));
const projectKey = computed(() => entityKey('project', project.value));
const workspaceStorageKey = computed(() => projectWorkspaceStorageKey({
  userId: authStore.userData?.id || authStore.userData?.userId || authStore.userData?._id,
  organizationId: authStore.organizationData?._id || authStore.userData?.organizationId,
  projectId: entityId(project.value)
}));
const projectItem = computed(() => project.value ? {
  key: projectKey.value,
  kind: 'entity',
  type: 'project',
  entity: project.value,
  region: mainRegion.value
} : null);
const projectActionContext = computed(() => ({
  parentEntityType: 'project',
  parentEntity: project.value,
  parentEntityId: entityId(project.value)
}));
const childSections = computed(() => regions.value
  .filter(region => region !== mainRegion.value)
  .map(region => {
    const state = sourceStateForRegion(region);
    return {
      region,
      source: state.source,
      entityType: state.source?.entityType || '',
      items: state.items || []
    };
  })
  .filter(section => section.source?.mode === 'list' && section.entityType));
const entityItems = computed(() => [
  projectItem.value,
  ...childSections.value.flatMap(section => section.items.map(entity => ({
    key: entityKey(section.entityType, entity),
    kind: 'entity',
    type: section.entityType,
    entity,
    region: section.region
  })))
].filter(item => item?.entity && entityId(item.entity)));
const workspaceEntityItems = computed(() => [...entityItems.value, ...linkedEntityItems.value, ...openedEntityItems.value]
  .filter((item, index, items) => items.findIndex(candidate => candidate.key === item.key) === index));
const explorerHierarchy = computed(() => projectExplorerHierarchy({
  projectItem: projectItem.value,
  items: workspaceEntityItems.value,
  linkedItemKeys: linkedEntityItems.value.map(item => item.key),
  containment: effectiveContainment()
}));
const linkedRefs = computed(() => Object.values(project.value?.relations || {})
  .flatMap(value => resolveEntityRelationRefs(value)));
const cassetteItems = computed(() => workspaceEntityItems.value.filter(item => item.type === 'cassette'));
const projectActions = computed(() => projectContextActionEntries({
  actionManifest: authStore.actionManifest,
  screenActionIds: props.screenActions || [],
  projectActionIds: mainRegion.value?.actions || [],
  childSections: childSections.value.map(section => ({
    ...section,
    context: sectionActionContext(section)
  })),
  project: project.value,
  projectContext: projectActionContext.value
}));
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
)).map(item => workspaceFilePresentation(item, {
  label: workspaceItemLabel(item),
  icon: item.kind === 'entity'
    ? domainUi.getIcon(item.entityType || item.type || '')
    : resolveGeneratedWorkspacePage(item.pageId)?.icon || 'pi pi-file',
  modified: dirtyFileKeys.value.has(item.key)
})));
const dirtyTabKeys = computed(() => [...dirtyFileKeys.value]);
const panes = computed(() => workspaceLeaves(paneTree.value));
const paneCount = computed(() => panes.value.length);
const activePane = computed(() => panes.value.find(pane => pane.id === activePaneId.value) || panes.value[0]);
const displayedPaneTree = computed(() => {
  if (!maximizedPaneId.value) return paneTree.value;
  const pane = panes.value.find(item => item.id === maximizedPaneId.value);
  return pane || paneTree.value;
});
const mobileWorkspaceOptions = computed(() => workspaceItems.value.map(item => ({
  label: workspaceItemLabel(item),
  value: item.key
})));
const quickOpenItems = computed(() => {
  const query = quickOpenQuery.value.trim().toLocaleLowerCase();
  return workspaceItems.value.filter(item => !query || item.label.toLocaleLowerCase().includes(query));
});
const explorerNodes = computed(() => {
  if (!projectItem.value) return [];
  return [{
    key: projectItem.value.key,
    icon: domainUi.getIcon('project'),
    data: { item: projectItem.value },
    children: [
      ...(explorerHierarchy.value.linkedRootItems.length ? [{
        key: 'section:linked-entities',
        label: t('project.linkedEntities'),
        data: { linked: true },
        selectable: false,
        children: explorerHierarchy.value.linkedRootItems.map(item => explorerEntityNode(item))
      }] : []),
      ...childSections.value.map(section => ({
        key: `section:${section.region.id}`,
        label: generatedEntityLabel(section.entityType, { t, te }),
        data: { section },
        selectable: false,
        children: explorerSectionRootItems(section).map(item => explorerEntityNode(item))
      })).filter(section => section.children.length),
      ...explorerHierarchy.value.rootItems
        .filter(item => !item.region)
        .map(item => explorerEntityNode(item)),
      ...explorerHierarchy.value.orphanItems
        .filter(item => !item.region)
        .map(item => explorerEntityNode(item))
    ].filter(Boolean)
  }];
});

function explorerSectionRootItems(section) {
  const regionId = section.region?.id;
  return [...explorerHierarchy.value.rootItems, ...explorerHierarchy.value.orphanItems]
    .filter(item => item.region?.id === regionId);
}

watch(workspaceStorageKey, key => {
  if (!key || typeof window === 'undefined') return;
  const state = loadProjectWorkspaceState(window.localStorage, key);
  paneTree.value = state.paneTree;
  activePaneId.value = state.activePaneId;
  paneSequence.value = state.paneSequence;
  explorerOpen.value = state.explorerOpen;
  explorerSize.value = state.explorerSize;
  openedEntityRefs.value = state.openedEntityRefs;
  openedPageRefs.value = state.openedPageRefs;
  maximizedPaneId.value = state.maximizedPaneId;
  recentlyClosedRefs.value = state.recentlyClosedRefs;
  layoutPresets.value = state.layoutPresets;
  hydratedStorageKey.value = key;
  syncActiveSelection();
}, { immediate: true });

watch(
  [paneTree, activePaneId, paneSequence, explorerOpen, explorerSize, openedEntityRefs, openedPageRefs, maximizedPaneId, recentlyClosedRefs, layoutPresets],
  () => {
    const key = workspaceStorageKey.value;
    if (!key || hydratedStorageKey.value !== key || typeof window === 'undefined') return;
    saveProjectWorkspaceState(window.localStorage, key, {
      paneTree: paneTree.value,
      activePaneId: activePaneId.value,
      paneSequence: paneSequence.value,
      explorerOpen: explorerOpen.value,
      explorerSize: explorerSize.value,
      openedEntityRefs: openedEntityRefs.value,
      openedPageRefs: openedPageRefs.value,
      maximizedPaneId: maximizedPaneId.value,
      recentlyClosedRefs: recentlyClosedRefs.value,
      layoutPresets: layoutPresets.value
    });
  },
  { deep: true }
);

watch(project, value => {
  if (!value || !activePane.value) return;
  syncActiveSelection();
  expandedKeys.value = {
    ...expandedKeys.value,
    [projectKey.value]: true,
    ...Object.fromEntries(childSections.value.map(section => [`section:${section.region.id}`, true]))
  };
}, { immediate: true });

watch(workspaceItems, () => {
  syncActiveSelection();
}, { deep: true });

watch(linkedRefs, async refs => {
  const loaded = await Promise.all(refs.map(async ref => {
    const existing = entityItems.value.find(item => (
      item.type === ref.entityType && entityId(item.entity) === ref.id
    ));
    const entity = existing?.entity || ref.entity
      || await entityStore.fetchEntity(ref.entityType, ref.id, false, { silent: true });
    return entity ? {
      key: entityKey(ref.entityType, entity),
      kind: 'entity',
      type: ref.entityType,
      entity,
      region: null
    } : null;
  }));
  linkedEntityItems.value = loaded.filter(Boolean);
}, { immediate: true });

watch(openedEntityRefs, async refs => {
  const sequence = ++openedEntityLoadSequence;
  const loaded = await Promise.all(refs.map(async reference => {
    const existing = entityItems.value.find(item => (
      item.type === reference.entityType && entityId(item.entity) === reference.entityId
    )) || linkedEntityItems.value.find(item => (
      item.type === reference.entityType && entityId(item.entity) === reference.entityId
    ));
    const entity = existing?.entity
      || await entityStore.fetchEntity(reference.entityType, reference.entityId, false, { silent: true });
    return entity ? workspaceEntityItem(reference.entityType, entity) : null;
  }));
  if (sequence !== openedEntityLoadSequence) return;
  openedEntityItems.value = loaded.filter(Boolean);
}, { immediate: true, deep: true });

watch(activePaneId, syncActiveSelection);

onMounted(() => window.addEventListener('keydown', handleWorkspaceShortcut));
onBeforeUnmount(() => window.removeEventListener('keydown', handleWorkspaceShortcut));

function handleWorkspaceShortcut(event) {
  if (!(event.ctrlKey || event.metaKey) || isEditableTarget(event.target) || !activePane.value) return;
  const pane = activePane.value;
  if (event.key === 'w') {
    if (!pane.selectionKey) return;
    event.preventDefault();
    closePaneTab(pane.id, pane.selectionKey);
    return;
  }
  if (event.key.toLowerCase() === 'p') {
    event.preventDefault();
    quickOpenVisible.value = true;
    return;
  }
  if (event.key === 'PageDown' || event.key === 'PageUp') {
    const tabs = pane.tabKeys || [];
    if (tabs.length < 2) return;
    event.preventDefault();
    const index = tabs.indexOf(pane.selectionKey);
    const direction = event.key === 'PageDown' ? 1 : -1;
    selectPaneTab(pane.id, tabs[(index + direction + tabs.length) % tabs.length]);
    return;
  }
  if (event.key === '\\') {
    event.preventDefault();
    splitPane(pane.id, event.shiftKey ? 'vertical' : 'horizontal');
    return;
  }
  if (event.key.toLowerCase() === 'm') {
    event.preventDefault();
    togglePaneMaximize(pane.id);
  }
}

function openQuickItem(key) {
  quickOpenVisible.value = false;
  selectByKey(key);
}

function isEditableTarget(target) {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(element?.closest('input, textarea, [contenteditable="true"]'));
}

function selectNode(node) {
  const item = node.data?.item;
  if (!item) return;
  selectByKey(item.key);
}

function explorerEntityNode(item) {
  if (!item) return null;
  const contained = explorerHierarchy.value.childrenByKey.get(item.key) || [];
  return {
    key: item.key,
    icon: domainUi.getIcon(item.type),
    data: { item },
    children: [
      ...contained.map(child => explorerEntityNode(child)),
      ...openedPagesForEntity(item).map(pageNode)
    ]
  };
}

function explorerEntityCanDelete(item) {
  return item?.type !== 'project' && canDeleteGeneratedEntity({
    authStore,
    domainUi,
    entity: item?.entity,
    entityType: item?.type
  });
}

function handleExplorerEntityDeleted(item) {
  const removedKeys = new Set([
    item.key,
    ...openedPageRefs.value
      .filter(page => page.entityType === item.type && page.entityId === entityId(item.entity))
      .map(page => page.key)
  ]);
  openedEntityRefs.value = openedEntityRefs.value.filter(reference => reference.key !== item.key);
  openedEntityItems.value = openedEntityItems.value.filter(candidate => candidate.key !== item.key);
  linkedEntityItems.value = linkedEntityItems.value.filter(candidate => candidate.key !== item.key);
  openedPageRefs.value = openedPageRefs.value.filter(page => !removedKeys.has(page.key));
  let nextTree = paneTree.value;
  for (const pane of workspaceLeaves(nextTree)) {
    const tabKeys = (pane.tabKeys || []).filter(key => !removedKeys.has(key));
    const selectionKey = removedKeys.has(pane.selectionKey)
      ? (tabKeys[tabKeys.length - 1] || '')
      : pane.selectionKey;
    nextTree = updateWorkspaceLeaf(nextTree, pane.id, { tabKeys, selectionKey });
  }
  paneTree.value = nextTree;
  dirtyFileKeys.value = new Set([...dirtyFileKeys.value].filter(key => !removedKeys.has(key)));
  syncActiveSelection();
  emit('refresh');
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
  const closingItem = workspaceItems.value.find(item => item.key === key);
  if (closingItem) rememberRecentlyClosed(closingItem);
  const remainingTabKeys = new Set(workspaceLeaves(nextTree).flatMap(leaf => leaf.tabKeys || []));
  if (!remainingTabKeys.has(key)) {
    openedPageRefs.value = openedPageRefs.value.filter(reference => reference.key !== key);
  }
  activePaneId.value = paneId;
  dirtyFileKeys.value = new Set([...dirtyFileKeys.value].filter(dirtyKey => dirtyKey !== key));
  syncActiveSelection();
}

function reorderPaneTab(paneId, { key, beforeKey } = {}) {
  const pane = panes.value.find(item => item.id === paneId);
  if (!pane || !key || !pane.tabKeys?.includes(key)) return;
  const remaining = pane.tabKeys.filter(tabKey => tabKey !== key);
  const index = beforeKey ? remaining.indexOf(beforeKey) : -1;
  const tabKeys = index < 0
    ? [...remaining, key]
    : [...remaining.slice(0, index), key, ...remaining.slice(index)];
  paneTree.value = updateWorkspaceLeaf(paneTree.value, paneId, { tabKeys });
}

function movePaneTab({ key, paneId, targetPaneId, beforeKey } = {}) {
  const source = panes.value.find(pane => pane.id === paneId);
  const target = panes.value.find(pane => pane.id === targetPaneId);
  if (!key || !source || !target || source.id === target.id || !source.tabKeys?.includes(key)) return;
  const sourceKeys = source.tabKeys.filter(tabKey => tabKey !== key);
  const sourceSelection = source.selectionKey === key ? (sourceKeys[0] || '') : source.selectionKey;
  let nextTree = updateWorkspaceLeaf(paneTree.value, source.id, {
    tabKeys: sourceKeys,
    selectionKey: sourceSelection
  });
  const targetKeys = target.tabKeys.filter(tabKey => tabKey !== key);
  const index = beforeKey ? targetKeys.indexOf(beforeKey) : -1;
  const nextTargetKeys = index < 0
    ? [...targetKeys, key]
    : [...targetKeys.slice(0, index), key, ...targetKeys.slice(index)];
  nextTree = updateWorkspaceLeaf(nextTree, target.id, { tabKeys: nextTargetKeys, selectionKey: key });
  paneTree.value = nextTree;
  activePaneId.value = target.id;
  syncActiveSelection();
}

function togglePaneMaximize(paneId) {
  if (!panes.value.some(pane => pane.id === paneId) || paneCount.value <= 1) return;
  maximizedPaneId.value = maximizedPaneId.value === paneId ? '' : paneId;
  activePaneId.value = paneId;
}

function workspaceLayoutState() {
  return {
    paneTree: paneTree.value,
    activePaneId: activePaneId.value,
    paneSequence: paneSequence.value,
    explorerOpen: explorerOpen.value,
    explorerSize: explorerSize.value,
    maximizedPaneId: maximizedPaneId.value,
    openedEntityRefs: openedEntityRefs.value,
    openedPageRefs: openedPageRefs.value
  };
}

function saveWorkspaceLayoutPreset() {
  const name = layoutPresetNameDraft.value.trim();
  if (!name) return;
  const id = `layout-${Date.now().toString(36)}`;
  const preset = workspaceLayoutPresetFromState(workspaceLayoutState(), { id, name });
  if (!preset) return;
  layoutPresets.value = [...layoutPresets.value, preset];
  layoutPresetNameDraft.value = '';
}

function applyWorkspaceLayoutPreset(preset) {
  const next = workspaceLayoutPresetFromState(preset, preset);
  if (!next) return;
  paneTree.value = next.paneTree;
  activePaneId.value = next.activePaneId;
  paneSequence.value = next.paneSequence;
  explorerOpen.value = next.explorerOpen;
  explorerSize.value = next.explorerSize;
  maximizedPaneId.value = next.maximizedPaneId;
  openedEntityRefs.value = mergeWorkspaceReferences(openedEntityRefs.value, next.openedEntityRefs);
  openedPageRefs.value = mergeWorkspaceReferences(openedPageRefs.value, next.openedPageRefs);
  syncActiveSelection();
}

function mergeWorkspaceReferences(current, next) {
  return [...current, ...next].filter((reference, index, references) => (
    reference?.key && references.findIndex(candidate => candidate?.key === reference.key) === index
  ));
}

function renameWorkspaceLayoutPreset(preset) {
  const name = window.prompt(t('project.workspaceLayoutName'), preset.name)?.trim();
  if (!name) return;
  layoutPresets.value = layoutPresets.value.map(item => item.id === preset.id ? { ...item, name } : item);
}

function deleteWorkspaceLayoutPreset(id) {
  layoutPresets.value = layoutPresets.value.filter(preset => preset.id !== id);
}

function resetWorkspaceLayout() {
  paneTree.value = createWorkspaceLeaf('pane-1');
  activePaneId.value = 'pane-1';
  paneSequence.value = 1;
  explorerOpen.value = true;
  explorerSize.value = 15;
  maximizedPaneId.value = '';
  syncActiveSelection();
}

function rememberRecentlyClosed(item) {
  const reference = workspaceReference(item);
  if (!reference) return;
  recentlyClosedRefs.value = [
    reference,
    ...recentlyClosedRefs.value.filter(candidate => candidate.key !== reference.key)
  ].slice(0, 20);
}

async function reopenLastClosed(paneId) {
  const [reference, ...remaining] = recentlyClosedRefs.value;
  if (!reference || !panes.value.some(pane => pane.id === paneId)) return;
  recentlyClosedRefs.value = remaining;
  activePaneId.value = paneId;
  const entity = await entityStore.fetchEntity(reference.entityType, reference.entityId, false, { silent: true });
  if (!entity) return;
  const item = rememberWorkspaceEntity(reference.entityType, entity);
  if (!item) return;
  if (reference.kind === 'page') {
    openWorkspacePage({ pageId: reference.pageId, entity, entityType: reference.entityType });
    return;
  }
  selectPaneTab(paneId, item.key);
}

function workspaceReference(item) {
  const id = entityId(item?.entity);
  if (!item?.key || !item?.kind || !(item.entityType || item.type) || !id) return null;
  return {
    key: item.key,
    kind: item.kind,
    entityType: item.entityType || item.type,
    entityId: id,
    ...(item.kind === 'page' ? { pageId: item.pageId } : {})
  };
}

function updateFileDirty({ key, dirty } = {}) {
  if (!key) return;
  const next = new Set(dirtyFileKeys.value);
  if (dirty) next.add(key);
  else next.delete(key);
  dirtyFileKeys.value = next;
}

function activatePane(paneId) {
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

function resizeWorkspaceShell(event) {
  if (!explorerOpen.value || !Array.isArray(event?.sizes)) return;
  const nextSize = Number(event.sizes[0]);
  if (Number.isFinite(nextSize)) explorerSize.value = Math.min(40, Math.max(10, nextSize));
}

function closePane(paneId) {
  if (paneCount.value <= 1) return;
  paneTree.value = closeWorkspaceLeaf(paneTree.value, paneId);
  activePaneId.value = workspaceLeaves(paneTree.value)[0]?.id || 'pane-1';
}

function openWorkspaceEntity(request = {}) {
  const item = rememberWorkspaceEntity(request.entityType, request.entity);
  if (!item) return;
  selectByKey(item.key);
}

function openWorkspacePage(request = {}) {
  const definition = resolveGeneratedWorkspacePage(request.pageId);
  if (!definition) return;
  if (!definition.entityType) {
    selectByKey(`page:${definition.id}`);
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
  expandedKeys.value = {
    ...expandedKeys.value,
    [entityItem.key]: true,
    ...(entityItem.region ? { [`section:${entityItem.region.id}`]: true } : {})
  };
  syncActiveSelection();
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

function syncActiveSelection() {
  const key = activePane.value?.selectionKey || '';
  selectionKeys.value = key ? { [key]: true } : {};
  mobileSelectedKey.value = key;
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

function actionEntriesForPane(pane) {
  const item = itemForPane(pane);
  if (!item || item.kind !== 'entity' || item.type === 'project') return [];
  return entityActionEntries(
    [...(item.region?.actions || []), ...(props.screenActions || [])],
    item,
    sectionActionContext(sectionForItem(item))
  );
}

function entityActionEntries(actionIds, item, context) {
  return [...new Set(actionIds)]
    .map(actionId => authStore.actionManifest.find(action => action.actionId === actionId))
    .filter(Boolean)
    .filter(isGeneratedSurfaceAction)
    .filter(action => actionAppliesToEntity(action, item.entity, item.type))
    .map(action => ({
      key: `${item.key}:${action.actionId}`,
      actionId: action.actionId,
      entity: item.entity,
      context
    }));
}

function executeWorkspaceAction(action, entry = {}) {
  emit('execute-action', action, entry.entity ?? null, entry.context || projectActionContext.value);
}

function sectionForItem(item) {
  return childSections.value.find(section => section.region === item.region)
    || {
      region: item.region,
      source: sourceStateForRegion(item.region || {}).source,
      entityType: item.type,
      items: []
    };
}

function sectionActionContext(section) {
  return mergeCollectionActionContext({
    incoming: projectActionContext.value,
    region: section.region,
    source: section.source,
    entityType: section.entityType,
    items: section.items || []
  });
}

function openedPagesForEntity(item) {
  if (!item?.entity) return [];
  return openedPageItems.value.filter(page => (
    page.entityType === item.type
    && entityId(page.entity) === entityId(item.entity)
  ));
}

function pageNode(page) {
  if (!page) return null;
  const definition = resolveGeneratedWorkspacePage(page.pageId);
  if (!definition) return null;
  return {
    key: page.key,
    label: t(definition.labelKey),
    icon: definition.icon,
    data: { item: page }
  };
}

function workspaceItemLabel(item) {
  if (item?.kind === 'entity') {
    return item.entity?.identity?.name || item.entity?.identity?.uid || entityId(item.entity);
  }
  const definition = resolveGeneratedWorkspacePage(item?.pageId);
  return definition ? t(definition.labelKey) : '';
}


function sourceStateForRegion(region = {}) {
  return props.sourceState(region.sourceId) || {};
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
    region: null
  };
}

function entityId(entity = null) {
  const value = entity?._id || entity?.identity?.uid || '';
  return value ? String(value) : '';
}
</script>

<style scoped>
.project-explorer {
  container-type: inline-size;
}

.project-explorer-tree :deep(.p-tree-root),
.project-explorer-tree :deep(.p-tree-node),
.project-explorer-tree :deep(.p-tree-node-content),
.project-explorer-tree :deep(.p-tree-node-label),
.project-explorer-tree :deep(.p-tree-node-children) {
  min-width: 0;
  max-width: 100%;
}

.project-explorer-tree :deep(.p-tree-node-content),
.project-explorer-tree :deep(.p-tree-node-label) {
  overflow: hidden;
}

@container (max-width: 14rem) {
  .project-explorer-tree :deep(.p-tree-node-children) {
    padding-inline-start: 0;
  }
}
</style>
