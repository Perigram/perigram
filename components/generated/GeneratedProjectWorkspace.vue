<template>
  <div v-if="project" class="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
    <header
      class="chrome-signal-rule flex h-10 shrink-0 items-center gap-1 border-b [border-color:var(--ck-chrome-border)] bg-chrome px-1 text-[var(--ck-chrome-foreground)]"
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
    </header>

    <div class="min-h-0 flex-1 overflow-hidden">
      <Splitter :gutter-size="1" class="hidden h-full min-h-0 !border-0 lg:flex">
        <SplitterPanel
          v-if="explorerOpen"
          key="workspace-explorer"
          :size="20"
          :min-size="12"
          class="min-h-0 min-w-0 overflow-hidden !border-0"
        >
          <section class="flex h-full min-h-0 flex-col overflow-hidden bg-content">
            <header class="chrome-signal-rule flex h-10 shrink-0 items-center border-b [border-color:var(--ck-chrome-border)] bg-chrome px-1 text-[var(--ck-chrome-foreground)]">
              <span class="min-w-0 flex-1 truncate font-medium">{{ $t('project.explorer') }}</span>
            </header>
            <Tree
              v-model:selection-keys="selectionKeys"
              v-model:expanded-keys="expandedKeys"
              :value="explorerNodes"
              selection-mode="single"
              :aria-label="$t('project.explorer')"
              class="min-h-0 flex-1 overflow-y-auto !border-0 !p-0"
              :pt="explorerTreePt"
              @node-select="selectNode"
            >
              <template #default="{ node }">
                <div v-if="node.data?.item?.kind === 'entity'" class="min-w-0">
                  <IdentityBlock :entity="node.data.item.entity" variant="compact" class="min-w-0" />
                </div>
                <div v-else class="flex min-w-0 flex-1 items-center gap-2">
                  <span class="min-w-0 flex-1 truncate">{{ node.label }}</span>
                  <span v-if="node.data?.section" class="text-sm text-muted-color">{{ node.children?.length || 0 }}</span>
                </div>
              </template>
            </Tree>
          </section>
        </SplitterPanel>

        <SplitterPanel
          key="workspace-content"
          :size="explorerOpen ? 80 : 100"
          :min-size="30"
          class="min-h-0 min-w-0 overflow-hidden !border-0"
        >
          <WorkspaceSplitNode
            :node="paneTree"
            :active-pane-id="activePaneId"
            @activate="activatePane"
          >
            <template #default="{ pane }">
              <GeneratedWorkspacePane
                :item="itemForPane(pane)"
                :action-entries="actionEntriesForPane(pane)"
                :closeable="paneCount > 1"
                @execute-action="executeWorkspaceAction"
                @open-page="openWorkspacePage"
                @refresh="$emit('refresh')"
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
          :action-entries="actionEntriesForPane(activePane)"
          :splittable="false"
          @execute-action="executeWorkspaceAction"
          @open-page="openWorkspacePage"
          @refresh="$emit('refresh')"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import Button from 'primevue/button';
import Splitter from 'primevue/splitter';
import SplitterPanel from 'primevue/splitterpanel';
import Tree from 'primevue/tree';
import { useI18n } from 'vue-i18n';
import EntitySelect from '~/components/shared/EntitySelect.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import WorkspaceSplitNode from '~/components/shared/WorkspaceSplitNode.vue';
import GeneratedProjectActionPalette from '~/components/generated/GeneratedProjectActionPalette.vue';
import GeneratedWorkspacePane from '~/components/generated/GeneratedWorkspacePane.vue';
import { actionAppliesToEntity, isGeneratedSurfaceAction } from '~/components/generated/action-visibility.js';
import { mergeCollectionActionContext } from '~/components/generated/action-context.js';
import { projectContextActionEntries } from '~/components/generated/project-context-actions.js';
import { resolveGeneratedWorkspacePage } from '~/components/generated/workspace-pages.js';
import { useAuthStore } from '~/stores/auth';
import { useCutkitDomainUi } from '~/composables/useCutkitDomainUi.js';
import { generatedEntityLabel } from '~/utils/generated-labels.js';
import {
  closeWorkspaceLeaf,
  createWorkspaceLeaf,
  splitWorkspaceLeaf,
  updateWorkspaceLeaf,
  workspaceLeaves
} from '~/utils/workspace-splits.js';

const props = defineProps({
  screen: { type: Object, required: true },
  sourceState: { type: Function, required: true },
  screenActions: { type: Array, default: () => [] }
});

const emit = defineEmits(['refresh', 'execute-action']);
const authStore = useAuthStore();
const domainUi = useCutkitDomainUi();
const { t, te } = useI18n();
const explorerOpen = ref(true);
const selectionKeys = ref({});
const expandedKeys = ref({});
const mobileSelectedKey = ref('');
const activePaneId = ref('pane-1');
const paneSequence = ref(1);
const paneTree = ref(createWorkspaceLeaf('pane-1'));
const openedPageRefs = ref([]);
const explorerTreePt = {
  nodeContent: { class: '!px-1 !py-0.5 !gap-1' },
  nodeToggleButton: { class: '!h-6 !w-6' }
};

const regions = computed(() => props.screen.regions || []);
const mainRegion = computed(() => regions.value.find(region => sourceStateForRegion(region).source?.mode === 'single') || regions.value[0] || null);
const project = computed(() => mainRegion.value ? sourceStateForRegion(mainRegion.value).entity : null);
const projectKey = computed(() => entityKey('project', project.value));
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
const cassetteItems = computed(() => entityItems.value.filter(item => item.type === 'cassette'));
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
  const entityItem = entityItems.value.find(item => (
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
  ...entityItems.value,
  ...openedPageItems.value
].filter(Boolean));
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
    icon: domainUi.getIcon('project'),
    data: { item: projectItem.value },
    children: [
      ...childSections.value.map(section => ({
        key: `section:${section.region.id}`,
        label: generatedEntityLabel(section.entityType, { t, te }),
        data: { section },
        selectable: false,
        children: section.items.map(entity => {
          const item = entityItems.value.find(candidate => candidate.key === entityKey(section.entityType, entity));
          return {
            key: item?.key,
            icon: domainUi.getIcon(section.entityType),
            data: { item },
            children: openedPagesForEntity(item).map(pageNode)
          };
        })
      }))
    ].filter(Boolean)
  }];
});

watch(project, value => {
  if (!value || !activePane.value) return;
  if (!activePane.value.selectionKey) {
    paneTree.value = updateWorkspaceLeaf(paneTree.value, activePane.value.id, {
      selectionKey: defaultPaneKey()
    });
  }
  syncActiveSelection();
  expandedKeys.value = {
    ...expandedKeys.value,
    [projectKey.value]: true,
    ...Object.fromEntries(childSections.value.map(section => [`section:${section.region.id}`, true]))
  };
}, { immediate: true });

watch(workspaceItems, items => {
  const visibleKeys = new Set(items.map(item => item.key));
  for (const pane of panes.value) {
    if (!visibleKeys.has(pane.selectionKey)) {
      paneTree.value = updateWorkspaceLeaf(paneTree.value, pane.id, {
        selectionKey: defaultPaneKey()
      });
    }
  }
  syncActiveSelection();
}, { deep: true });

watch(activePaneId, syncActiveSelection);

function selectNode(node) {
  const item = node.data?.item;
  if (!item) return;
  selectByKey(item.key);
}

function selectByKey(key) {
  if (!workspaceItems.value.some(item => item.key === key) || !activePane.value) return;
  paneTree.value = updateWorkspaceLeaf(paneTree.value, activePane.value.id, { selectionKey: key });
  syncActiveSelection();
}

function activatePane(paneId) {
  activePaneId.value = paneId;
}

function splitPane(paneId, orientation) {
  const source = panes.value.find(pane => pane.id === paneId);
  if (!source) return;
  const nextPane = createWorkspaceLeaf(`pane-${++paneSequence.value}`, source.selectionKey);
  paneTree.value = splitWorkspaceLeaf(paneTree.value, paneId, orientation, nextPane);
  activePaneId.value = nextPane.id;
}

function closePane(paneId) {
  if (paneCount.value <= 1) return;
  paneTree.value = closeWorkspaceLeaf(paneTree.value, paneId);
  activePaneId.value = workspaceLeaves(paneTree.value)[0]?.id || 'pane-1';
}

function openWorkspacePage(request = {}) {
  const definition = resolveGeneratedWorkspacePage(request.pageId);
  if (!definition) return;
  if (!definition.entityType) {
    selectByKey(`page:${definition.id}`);
    return;
  }
  if (definition.entityType !== request.entityType) return;

  const entityItem = entityItems.value.find(item => (
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
  paneTree.value = updateWorkspaceLeaf(paneTree.value, activePane.value.id, { selectionKey: key });
  expandedKeys.value = {
    ...expandedKeys.value,
    [entityItem.key]: true,
    ...(entityItem.region ? { [`section:${entityItem.region.id}`]: true } : {})
  };
  syncActiveSelection();
}

function syncActiveSelection() {
  const key = activePane.value?.selectionKey || defaultPaneKey();
  selectionKeys.value = key ? { [key]: true } : {};
  mobileSelectedKey.value = key;
}

function itemForPane(pane) {
  return workspaceItems.value.find(item => item.key === pane?.selectionKey)
    || projectItem.value
    || null;
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

function defaultPaneKey() {
  return projectKey.value;
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

function entityId(entity = null) {
  const value = entity?._id || entity?.identity?.uid || '';
  return value ? String(value) : '';
}
</script>
