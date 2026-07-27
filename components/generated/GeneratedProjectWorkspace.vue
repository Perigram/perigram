<template>
  <div v-if="project" class="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
    <Splitter :gutter-size="1" class="hidden h-full min-h-0 !border-0 lg:flex">
      <SplitterPanel :size="20" :min-size="12" class="min-h-0 min-w-0 overflow-hidden !border-0">
        <section class="flex h-full min-h-0 flex-col overflow-hidden bg-content">
          <header class="flex h-10 shrink-0 items-center justify-between border-b border-content-border px-1">
            <span class="truncate font-medium">{{ $t('project.explorer') }}</span>
            <Button
              icon="pi pi-refresh"
              text
              rounded
              size="small"
              :aria-label="$t('common.refresh')"
              @click="$emit('refresh')"
            />
          </header>
          <Tree
            v-model:selection-keys="selectionKeys"
            v-model:expanded-keys="expandedKeys"
            :value="explorerNodes"
            selection-mode="single"
            class="min-h-0 flex-1 overflow-y-auto !border-0 !p-0"
            :pt="explorerTreePt"
            @node-select="selectNode"
          >
            <template #default="{ node }">
              <div v-if="node.data?.entity" class="min-w-0">
                <IdentityBlock :entity="node.data.entity" variant="compact" class="min-w-0" />
              </div>
              <div v-else class="flex min-w-0 flex-1 items-center gap-2">
                <span class="min-w-0 flex-1 truncate">{{ node.label }}</span>
                <span class="text-sm text-muted-color">{{ node.children?.length || 0 }}</span>
              </div>
            </template>
          </Tree>
        </section>
      </SplitterPanel>

      <SplitterPanel :size="80" :min-size="30" class="min-h-0 min-w-0 overflow-hidden !border-0">
        <WorkspaceSplitNode
          :node="paneTree"
          :active-pane-id="activePaneId"
          @activate="activatePane"
        >
          <template #default="{ pane }">
            <GeneratedEntityFile
              :item="itemForPane(pane)"
              :action-entries="actionEntriesForPane(pane)"
              :closeable="paneCount > 1"
              @execute-action="executeFileAction"
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
          :options="mobileEntityOptions"
          option-label="label"
          option-value="value"
          class="w-full"
          @update:model-value="selectByKey"
        />
      </div>
      <GeneratedEntityFile
        class="min-h-0 flex-1"
        :item="itemForPane(activePane)"
        :action-entries="actionEntriesForPane(activePane)"
        :splittable="false"
        @execute-action="executeFileAction"
        @refresh="$emit('refresh')"
        @split="orientation => splitPane(activePane.id, orientation)"
      />
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
import GeneratedEntityFile from '~/components/generated/GeneratedEntityFile.vue';
import { actionAppliesToEntity, isGeneratedSurfaceAction } from '~/components/generated/action-visibility.js';
import { mergeCollectionActionContext } from '~/components/generated/action-context.js';
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
const selectionKeys = ref({});
const expandedKeys = ref({});
const mobileSelectedKey = ref('');
const activePaneId = ref('pane-1');
const paneSequence = ref(1);
const paneTree = ref(createWorkspaceLeaf('pane-1'));
const explorerTreePt = {
  nodeContent: { class: '!px-1 !py-0.5 !gap-1' },
  nodeToggleButton: { class: '!h-6 !w-6' }
};

const regions = computed(() => props.screen.regions || []);
const mainRegion = computed(() => regions.value.find(region => sourceStateForRegion(region).source?.mode === 'single') || regions.value[0] || null);
const project = computed(() => mainRegion.value ? sourceStateForRegion(mainRegion.value).entity : null);
const projectKey = computed(() => entityKey('project', project.value));
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
const explorerNodes = computed(() => {
  if (!project.value) return [];
  return [{
    key: projectKey.value,
    icon: domainUi.getIcon('project'),
    data: { entity: project.value, type: 'project', region: mainRegion.value },
    children: childSections.value.map(section => ({
      key: `section:${section.region.id}`,
      label: generatedEntityLabel(section.entityType, { t, te }),
      data: { section },
      selectable: false,
      children: section.items.map(entity => ({
        key: entityKey(section.entityType, entity),
        icon: domainUi.getIcon(section.entityType),
        data: { entity, type: section.entityType, region: section.region }
      }))
    }))
  }];
});
const selectableEntities = computed(() => [
  { key: projectKey.value, type: 'project', entity: project.value, region: mainRegion.value },
  ...childSections.value.flatMap(section => section.items.map(entity => ({
    key: entityKey(section.entityType, entity),
    type: section.entityType,
    entity,
    region: section.region
  })))
].filter(item => item.entity && entityId(item.entity)));
const mobileEntityOptions = computed(() => selectableEntities.value.map(item => ({
  label: item.entity.identity?.name || item.entity.identity?.uid || entityId(item.entity),
  value: item.key
})));
const panes = computed(() => workspaceLeaves(paneTree.value));
const paneCount = computed(() => panes.value.length);
const activePane = computed(() => panes.value.find(pane => pane.id === activePaneId.value) || panes.value[0]);
const childActionIds = computed(() => new Set(childSections.value.flatMap(section => section.region.actions || [])));

watch(project, value => {
  if (!value) return;
  if (!activePane.value?.selectionKey) {
    paneTree.value = updateWorkspaceLeaf(paneTree.value, activePane.value.id, { selectionKey: projectKey.value });
  }
  syncActiveSelection();
  expandedKeys.value = {
    [projectKey.value]: true,
    ...Object.fromEntries(childSections.value.map(section => [`section:${section.region.id}`, true]))
  };
}, { immediate: true });

watch(selectableEntities, items => {
  const visibleKeys = new Set(items.map(item => item.key));
  for (const pane of panes.value) {
    if (!visibleKeys.has(pane.selectionKey)) {
      paneTree.value = updateWorkspaceLeaf(paneTree.value, pane.id, { selectionKey: projectKey.value });
    }
  }
  syncActiveSelection();
}, { deep: true });

watch(activePaneId, syncActiveSelection);

function selectNode(node) {
  if (!node.data?.entity) return;
  selectByKey(entityKey(node.data.type, node.data.entity));
}

function selectByKey(key) {
  if (!selectableEntities.value.some(item => item.key === key) || !activePane.value) return;
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

function syncActiveSelection() {
  const key = activePane.value?.selectionKey || projectKey.value;
  selectionKeys.value = key ? { [key]: true } : {};
  mobileSelectedKey.value = key;
}

function itemForPane(pane) {
  return selectableEntities.value.find(item => item.key === pane?.selectionKey)
    || selectableEntities.value[0]
    || null;
}

function actionEntriesForPane(pane) {
  const item = itemForPane(pane);
  if (!item) return [];
  if (item.type === 'project') {
    const projectEntries = actionEntries(
      [...(props.screenActions || []), ...(mainRegion.value?.actions || [])]
        .filter(actionId => !childActionIds.value.has(actionId)),
      item,
      projectActionContext.value
    );
    const childCreateEntries = childSections.value.flatMap(section => (
      collectionActions(section).map(action => ({
        key: `collection:${section.region.id}:${action.actionId}`,
        actionId: action.actionId,
        entity: null,
        context: sectionActionContext(section)
      }))
    ));
    return uniqueEntries([...projectEntries, ...childCreateEntries]);
  }

  return actionEntries(
    [...(item.region?.actions || []), ...(props.screenActions || [])],
    item,
    sectionActionContext(sectionForItem(item))
  );
}

function actionEntries(actionIds, item, context) {
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

function collectionActions(section) {
  return [...new Set(section.region.actions || [])]
    .map(actionId => authStore.actionManifest.find(action => action.actionId === actionId))
    .filter(action => (
      action?.actionKind === 'createEntity'
      && action.entityType === section.entityType
      && actionParentType(action) === 'project'
    ));
}

function executeFileAction(action, entry = {}) {
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

function sourceStateForRegion(region = {}) {
  return props.sourceState(region.sourceId) || {};
}

function actionParentType(action = {}) {
  return action.parentEntityType
    || action.inputs?.find(input => input.id === 'parent')?.entityType
    || '';
}

function uniqueEntries(entries) {
  return [...new Map(entries.map(entry => [entry.actionId, entry])).values()];
}

function entityKey(type, entity) {
  return `${type}:${entityId(entity)}`;
}

function entityId(entity = null) {
  return entity?._id || entity?.identity?.uid || '';
}
</script>
