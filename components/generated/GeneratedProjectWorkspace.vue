<template>
  <div v-if="project" class="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
    <header
      class="flex h-10 shrink-0 items-center gap-1 border-b [border-color:var(--ck-chrome-border)] bg-chrome px-1 text-[var(--ck-chrome-foreground)]"
      data-project-actions-strip
    >
      <!-- Plain wrappers own responsive visibility: PrimeVue component styles
           load after Tailwind and would override `hidden` on .p-button /
           .p-splitter directly (see the app shell chat launcher note). -->
      <span class="hidden lg:inline-flex">
        <Button
          :icon="explorerOpen ? 'pi pi-angle-double-left' : 'pi pi-angle-double-right'"
          text
          rounded
          size="small"
          severity="secondary"
          :aria-label="$t(explorerOpen ? 'project.collapseExplorer' : 'project.expandExplorer')"
          @click="explorerOpen = !explorerOpen"
        />
      </span>
      <GeneratedProjectActionPalette
        :action-entries="projectActions"
        @execute-action="executeWorkspaceAction"
      />
      <!-- The project workspace is a screen-level implementation that
           bypasses the canonical detail chrome, so the entity chat entry
           rides the actions strip directly. -->
      <span class="ml-auto hidden lg:inline-flex">
        <Button
          icon="pi pi-comments"
          text
          rounded
          size="small"
          severity="secondary"
          :aria-label="$t('support.instanceChat')"
          @click="openProjectChat"
        />
      </span>
    </header>

    <div class="min-h-0 flex-1 overflow-hidden">
      <div class="hidden h-full min-h-0 lg:block">
        <Splitter
          :gutter-size="1"
          :pt="workspaceSplitterPt"
          class="h-full min-h-0 !border-0 !bg-transparent"
          @resizeend="resizeWorkspaceShell"
        >
          <SplitterPanel
            key="workspace-explorer"
            :size="explorerSize"
            :min-size="10"
            :class="['min-h-0 min-w-0 overflow-hidden !border-0', { '!hidden': !explorerOpen }]"
          >
            <section class="project-explorer flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
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
                  @open-entity="openWorkspaceEntity"
                  @open-page="openWorkspacePage"
                  @refresh="$emit('refresh')"
                  @select-tab="key => selectPaneTab(pane.id, key)"
                  @close-tab="key => closePaneTab(pane.id, key)"
                  @add-tab="openEmptyPaneTab(pane.id)"
                  @split="orientation => splitPane(pane.id, orientation)"
                  @close="closePane(pane.id)"
                />
              </template>
            </WorkspaceSplitNode>
          </SplitterPanel>
        </Splitter>
      </div>

      <div class="flex h-full min-h-0 flex-col lg:hidden">
        <div class="shrink-0 border-b border-content-border p-1">
          <InstanceSelect
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
          :action-entries="actionEntriesForPane(activePane)"
          :splittable="false"
          @execute-action="executeWorkspaceAction"
          @open-entity="openWorkspaceEntity"
          @open-page="openWorkspacePage"
          @refresh="$emit('refresh')"
          @select-tab="key => selectPaneTab(activePane.id, key)"
          @close-tab="key => closePaneTab(activePane.id, key)"
          @add-tab="openEmptyPaneTab(activePane.id)"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, provide, ref, watch } from 'vue';
import Button from 'primevue/button';
import { openEntityChat } from '~/utils/instance-chat.js';
import Splitter from 'primevue/splitter';
import SplitterPanel from 'primevue/splitterpanel';
import Tree from 'primevue/tree';
import { useI18n } from 'vue-i18n';
import InstanceSelect from '~/components/shared/InstanceSelect.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import WorkspaceSplitNode from '~/components/shared/WorkspaceSplitNode.vue';
import GeneratedProjectActionPalette from '~/components/generated/GeneratedProjectActionPalette.vue';
import GeneratedWorkspacePane from '~/components/generated/GeneratedWorkspacePane.vue';
import { actionAppliesToEntity, isGeneratedSurfaceAction } from '~/components/generated/action-visibility.js';
import { mergeCollectionActionContext } from '~/components/generated/action-context.js';
import { projectContextActionEntries } from '~/components/generated/project-context-actions.js';
import { resolveGeneratedWorkspacePage } from '~/components/generated/workspace-pages.js';
import { useAuthStore } from '~/stores/auth';
import { useInstancesStore } from '~/stores/instances';
import { useEffectiveContainment } from '~/composables/useEffectiveContainment.js';
import { generatedEntityLabel } from '~/utils/generated-labels.js';
import { resolveInstanceRelationRefs } from '~/utils/instance-relations.js';
import { projectExplorerHierarchy } from '~/utils/project-explorer-hierarchy.js';
import { emptyTabItem, emptyTabKey, isEmptyTabKey } from '~/utils/workspace-empty-tabs.js';
import { linkedExplorerChildSources } from '~/utils/project-linked-child-sources.js';
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
  saveProjectWorkspaceState
} from '~/utils/project-workspace-state.js';

const props = defineProps({
  screen: { type: Object, required: true },
  sourceState: { type: Function, required: true },
  screenActions: { type: Array, default: () => [] }
});

const emit = defineEmits(['refresh', 'execute-action']);
const authStore = useAuthStore();
const instances = useInstancesStore();
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
const linkedChildItems = ref([]);
const openedEntityItems = ref([]);
const hydratedStorageKey = ref('');
let openedEntityLoadSequence = 0;
let linkedChildLoadSequence = 0;
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
const openProjectChat = () => {
  const id = project.value?._id || project.value?.id || project.value?.identity?.uid || '';
  openEntityChat({
    type: 'project',
    id: String(id || ''),
    name: project.value?.identity?.name || ''
  });
};
provide('displayedEntityContexts', computed(() => project.value ? [{ type: 'project', entity: project.value }] : []));
const projectKey = computed(() => entityKey('project', project.value));
const workspaceStorageKey = computed(() => projectWorkspaceStorageKey({
  userId: authStore.userData?.id || authStore.userData?.userId || authStore.userData?._id,
  organizationId: authStore.organizationData?._id || authStore.userData?.organizationId,
  projectId: instanceId(project.value)
}));
const projectItem = computed(() => project.value ? {
  key: projectKey.value,
  kind: 'entity',
  type: 'project',
  entity: project.value,
  region: mainRegion.value
} : null);
const projectActionContext = computed(() => ({
  parentTypeId: 'project',
  parentEntity: project.value,
  parentEntityId: instanceId(project.value)
}));
const childSections = computed(() => regions.value
  .filter(region => region !== mainRegion.value)
  .map(region => {
    const state = sourceStateForRegion(region);
    return {
      region,
      source: state.source,
      typeId: state.source?.typeId || '',
      items: state.items || []
    };
  })
  .filter(section => section.source?.mode === 'list' && section.typeId));
const entityItems = computed(() => [
  projectItem.value,
  ...childSections.value.flatMap(section => section.items.map(entity => ({
    key: entityKey(section.typeId, entity),
    kind: 'entity',
    type: section.typeId,
    entity,
    region: section.region
  })))
].filter(item => item?.entity && instanceId(item.entity)));
const workspaceEntityItems = computed(() => [...entityItems.value, ...linkedEntityItems.value, ...linkedChildItems.value, ...openedEntityItems.value]
  .filter((item, index, items) => items.findIndex(candidate => candidate.key === item.key) === index));
const explorerHierarchy = computed(() => projectExplorerHierarchy({
  projectItem: projectItem.value,
  items: workspaceEntityItems.value,
  linkedItemKeys: linkedEntityItems.value.map(item => item.key),
  containment: effectiveContainment()
}));
const linkedRefs = computed(() => Object.values(project.value?.relations || {})
  .flatMap(value => resolveInstanceRelationRefs(value)));
const linkedChildSources = computed(() => linkedExplorerChildSources({
  linkedItems: linkedEntityItems.value,
  screens: authStore.screenManifest,
  containment: effectiveContainment()
}));
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
const mobileWorkspaceOptions = computed(() => workspaceItems.value.map(item => ({
  label: workspaceItemLabel(item),
  value: item.key
})));
const explorerNodes = computed(() => {
  if (!projectItem.value) return [];
  return [{
    key: projectItem.value.key,
    icon: instances.iconFor('project'),
    data: { item: projectItem.value },
    children: [
      ...(explorerHierarchy.value.linkedRootItems.length ? [{
        key: 'section:linked-entities',
        label: t('project.linkedEntities'),
        data: { linked: true },
        selectable: false,
        children: explorerHierarchy.value.linkedRootItems.map(item => explorerEntityNode(item, 'linked'))
      }] : []),
      ...childSections.value.map(section => ({
        key: `section:${section.region.id}`,
        label: generatedEntityLabel(section.typeId, { t, te }),
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
  hydratedStorageKey.value = key;
  syncActiveSelection();
}, { immediate: true });

watch(
  [paneTree, activePaneId, paneSequence, explorerOpen, explorerSize, openedEntityRefs, openedPageRefs],
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
      openedPageRefs: openedPageRefs.value
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
      item.type === ref.typeId && instanceId(item.entity) === ref.id
    ));
    const entity = existing?.entity || ref.entity
      || await instances.resolveReadableReference(instances.canonicalTypeKey(ref.typeId), ref.id, { silent: true });
    return entity ? {
      key: entityKey(ref.typeId, entity),
      kind: 'entity',
      type: ref.typeId,
      entity,
      region: null
    } : null;
  }));
  linkedEntityItems.value = loaded.filter(Boolean);
}, { immediate: true });

watch(linkedChildSources, async sources => {
  const sequence = ++linkedChildLoadSequence;
  const loaded = await Promise.all(sources.map(async source => {
    try {
      const entities = await instances.listInstances(instances.canonicalTypeKey(source.typeId), source.filters);
      return (Array.isArray(entities) ? entities : []).map(entity => workspaceEntityItem(source.typeId, entity));
    } catch {
      return [];
    }
  }));
  if (sequence !== linkedChildLoadSequence) return;
  linkedChildItems.value = loaded.flat();
}, { immediate: true, deep: true });

watch(openedEntityRefs, async refs => {
  const sequence = ++openedEntityLoadSequence;
  const loaded = await Promise.all(refs.map(async reference => {
    const existing = entityItems.value.find(item => (
      item.type === reference.typeId && instanceId(item.entity) === reference.instanceId
    )) || linkedEntityItems.value.find(item => (
      item.type === reference.typeId && instanceId(item.entity) === reference.instanceId
    ));
    const entity = existing?.entity
      || await instances.resolveReadableReference(instances.canonicalTypeKey(reference.typeId), reference.instanceId, { silent: true });
    return entity ? workspaceEntityItem(reference.typeId, entity) : null;
  }));
  if (sequence !== openedEntityLoadSequence) return;
  openedEntityItems.value = loaded.filter(Boolean);
}, { immediate: true, deep: true });

watch(activePaneId, syncActiveSelection);

function selectNode(node) {
  const item = node.data?.item;
  if (!item) return;
  selectByKey(item.key);
}

function explorerEntityNode(item, prefix = '') {
  if (!item) return null;
  const contained = explorerHierarchy.value.childrenByKey.get(item.key) || [];
  return {
    key: prefix ? `${prefix}:${item.key}` : item.key,
    icon: instances.iconFor(item.type),
    data: { item },
    children: [
      ...contained.map(child => explorerEntityNode(child)),
      ...openedPagesForEntity(item).map(pageNode)
    ]
  };
}

function selectByKey(key) {
  if (!workspaceItems.value.some(item => item.key === key) || !activePane.value) return;
  selectPaneTab(activePane.value.id, key);
}

function selectPaneTab(paneId, key) {
  const pane = panes.value.find(item => item.id === paneId);
  if (!pane) return;
  if (!isEmptyTabKey(key) && !workspaceItems.value.some(item => item.key === key)) return;
  paneTree.value = updateWorkspaceLeaf(paneTree.value, paneId, {
    selectionKey: key,
    tabKeys: withPaneTab(pane, key)
  });
  activePaneId.value = paneId;
  syncActiveSelection();
}

// Opening a real item replaces the pane's selected empty tab instead of
// piling placeholders beside it; empty tabs never accumulate duplicates.
function withPaneTab(pane, key) {
  const replacing = !isEmptyTabKey(key) && isEmptyTabKey(pane.selectionKey)
    ? [pane.selectionKey]
    : [];
  return [...new Set([...(pane.tabKeys || []).filter(tabKey => !replacing.includes(tabKey)), key])];
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
  }
  activePaneId.value = paneId;
  syncActiveSelection();
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
  // Screen panes emit id-bound opens; the stub carries the id exactly like
  // the previous payload shape, and pane hydration resolves the record.
  const item = rememberWorkspaceEntity(request.typeId, { _id: request.instanceId });
  if (!item) return;
  selectByKey(item.key);
}

function openWorkspacePage(request = {}) {
  const definition = resolveGeneratedWorkspacePage(request.pageId);
  if (!definition) return;
  if (!definition.typeId) {
    selectByKey(`page:${definition.id}`);
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
  expandedKeys.value = {
    ...expandedKeys.value,
    [entityItem.key]: true,
    ...(entityItem.region ? { [`section:${entityItem.region.id}`]: true } : {})
  };
  syncActiveSelection();
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
    .map(key => workspaceItems.value.find(item => item.key === key) || emptyTabItem(key));
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
      actionId: action.id,
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
      typeId: item.type,
      items: []
    };
}

function sectionActionContext(section) {
  return mergeCollectionActionContext({
    incoming: projectActionContext.value,
    region: section.region,
    source: section.source,
    typeId: section.typeId,
    items: section.items || []
  });
}

function openedPagesForEntity(item) {
  if (!item?.entity) return [];
  return openedPageItems.value.filter(page => (
    page.typeId === item.type
    && instanceId(page.entity) === instanceId(item.entity)
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
    return item.entity?.identity?.name || item.entity?.identity?.uid || instanceId(item.entity);
  }
  const definition = resolveGeneratedWorkspacePage(item?.pageId);
  return definition ? t(definition.labelKey) : '';
}

function sourceStateForRegion(region = {}) {
  return props.sourceState(region.sourceId) || {};
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
    kind: 'entity',
    type,
    entity,
    region: null
  };
}

function instanceId(entity = null) {
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

</style>
