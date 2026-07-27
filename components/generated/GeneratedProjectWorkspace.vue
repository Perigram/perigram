<template>
  <EntityPage
    v-if="project"
    :entity="project"
    entity-type="project"
    show-trace
    @refresh="$emit('refresh')"
  >
    <WorkspaceLanes class="min-h-[36rem]" :center-scroll="false">
      <template #left>
        <ScrollablePanel :header="$t('project.explorer')" class="h-full">
          <template #actions>
            <Button
              icon="pi pi-refresh"
              text
              rounded
              size="small"
              :aria-label="$t('common.refresh')"
              @click="$emit('refresh')"
            />
          </template>

          <Tree
            v-model:selection-keys="selectionKeys"
            v-model:expanded-keys="expandedKeys"
            :value="explorerNodes"
            selection-mode="single"
            @node-select="selectNode"
          >
            <template #default="{ node }">
              <div v-if="node.data?.entity" class="flex min-w-0 items-center gap-2">
                <i :class="[node.icon, 'shrink-0']"></i>
                <IdentityBlock :entity="node.data.entity" variant="compact" class="min-w-0 flex-1" />
              </div>
              <div v-else class="flex min-w-0 flex-1 items-center gap-2">
                <span class="min-w-0 flex-1 truncate">{{ node.label }}</span>
                <span class="text-sm text-muted-color">{{ node.children?.length || 0 }}</span>
                <span class="flex shrink-0 items-center" @click.stop>
                  <GeneratedActionButton
                    v-for="action in node.data?.actions || []"
                    :key="action.actionId"
                    :action-id="action.actionId"
                    icon-only
                    @execute="selectedAction => executeCollectionAction(selectedAction, node.data.section)"
                  />
                </span>
              </div>
            </template>
          </Tree>
        </ScrollablePanel>
      </template>

      <ScrollablePanel class="h-full">
        <template #header>
          <div v-if="selectedEntity" class="flex min-w-0 items-center gap-2">
            <i :class="[domainUi.getIcon(selectedEntityType), 'shrink-0']"></i>
            <IdentityBlock :entity="selectedEntity" variant="compact" class="min-w-0 flex-1" />
          </div>
        </template>

        <template #actions>
          <EntitySelect
            v-model="mobileSelectedKey"
            :options="mobileEntityOptions"
            option-label="label"
            option-value="value"
            class="lg:hidden"
            @update:model-value="selectByKey"
          />
        </template>

        <EntityCard
          v-if="selectedEntity"
          :entity="selectedEntity"
          :entity-type="selectedEntityType"
          variant="card"
          :surface="selectedSurface"
        >
          <EntitySurfaceContent
            :entity="selectedEntity"
            :entity-type="selectedEntityType"
            :surface="selectedSurface"
            :display-extensions="appEntityDisplayExtensions"
            relation-variant="compact"
          />
        </EntityCard>
        <StateBlock v-else :message="$t('common.noResults')" icon="pi pi-inbox" />
      </ScrollablePanel>

      <template #right>
        <div class="flex h-full min-h-0 flex-col gap-3">
          <ScrollablePanel
            v-if="selectedOperations.length || selectedCanDelete"
            :header="$t('project.operations')"
            :scroll-content="false"
          >
            <div class="flex flex-wrap gap-2">
              <GeneratedActionButton
                v-for="action in selectedOperations"
                :key="action.actionId"
                :action-id="action.actionId"
                @execute="selectedAction => $emit('execute-action', selectedAction, selectedEntity, selectedActionContext)"
              />
              <GeneratedDeleteButton
                :entity="selectedEntity"
                :entity-type="selectedEntityType"
                @deleted="$emit('refresh')"
              />
            </div>
          </ScrollablePanel>

          <ScrollablePanel :header="$t('project.lifecycle')" class="min-h-0 flex-1">
            <StatusHistory
              :key="selectedKey"
              :entity="selectedEntity"
              :entity-type="selectedEntityType"
              compact
            />
          </ScrollablePanel>
        </div>
      </template>
    </WorkspaceLanes>
  </EntityPage>
</template>

<script setup>
import { computed, provide, ref, watch } from 'vue';
import Button from 'primevue/button';
import Tree from 'primevue/tree';
import { useI18n } from 'vue-i18n';
import EntityCard from '~/components/shared/EntityCard.vue';
import EntityPage from '~/components/shared/EntityPage.vue';
import EntitySelect from '~/components/shared/EntitySelect.vue';
import EntitySurfaceContent from '~/components/shared/EntitySurfaceContent.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import ScrollablePanel from '~/components/shared/ScrollablePanel.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import StatusHistory from '~/components/shared/status/StatusHistory.vue';
import WorkspaceLanes from '~/components/shared/WorkspaceLanes.vue';
import GeneratedActionButton from '~/components/generated/GeneratedActionButton.vue';
import GeneratedDeleteButton from '~/components/generated/GeneratedDeleteButton.vue';
import { actionAppliesToEntity, isGeneratedSurfaceAction } from '~/components/generated/action-visibility.js';
import { canDeleteGeneratedEntity } from '~/components/generated/delete-visibility.js';
import { mergeCollectionActionContext } from '~/components/generated/action-context.js';
import { useAuthStore } from '~/stores/auth';
import { useCutkitDomainUi } from '~/composables/useCutkitDomainUi.js';
import { generatedEntityLabel } from '~/utils/generated-labels.js';
import { appEntityDisplayExtensions } from '~/utils/app-entity-surfaces.js';

const props = defineProps({
  screen: { type: Object, required: true },
  sourceState: { type: Function, required: true },
  screenActions: { type: Array, default: () => [] }
});

const emit = defineEmits(['refresh', 'execute-action']);
const authStore = useAuthStore();
const domainUi = useCutkitDomainUi();
const { t, te } = useI18n();
const selected = ref({ type: 'project', entity: null, region: null });
const selectionKeys = ref({});
const expandedKeys = ref({});
const mobileSelectedKey = ref('');

provide('generatedExecuteAction', (action, entity, context = {}) => {
  emit('execute-action', action, entity, context);
});

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
      data: { section, actions: collectionActions(section) },
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
const selectedEntity = computed(() => selected.value.entity || project.value);
const selectedEntityType = computed(() => selected.value.entity ? selected.value.type : 'project');
const selectedRegion = computed(() => selected.value.region || mainRegion.value);
const selectedKey = computed(() => entityKey(selectedEntityType.value, selectedEntity.value));
const selectedSurface = computed(() => selectedEntityType.value === 'project' ? 'detail' : 'card');
const childActionIds = computed(() => new Set(childSections.value.flatMap(section => section.region.actions || [])));
const selectedActionIds = computed(() => {
  const ids = selectedEntityType.value === 'project'
    ? [...(props.screenActions || []), ...(mainRegion.value?.actions || [])].filter(id => !childActionIds.value.has(id))
    : [...(selectedRegion.value?.actions || []), ...(props.screenActions || [])];
  return [...new Set(ids)];
});
const selectedOperations = computed(() => selectedActionIds.value
  .map(actionId => authStore.actionManifest.find(action => action.actionId === actionId))
  .filter(Boolean)
  .filter(isGeneratedSurfaceAction)
  .filter(action => !isLifecycleMutation(action))
  .filter(action => actionAppliesToEntity(action, selectedEntity.value, selectedEntityType.value)));
const selectedActionContext = computed(() => selectedEntityType.value === 'project'
  ? projectActionContext.value
  : sectionActionContext({
      region: selectedRegion.value,
      source: sourceStateForRegion(selectedRegion.value || {}).source,
      entityType: selectedEntityType.value,
      items: []
    }));
const selectedCanDelete = computed(() => canDeleteGeneratedEntity({
  authStore,
  domainUi,
  entity: selectedEntity.value,
  entityType: selectedEntityType.value
}));

watch(project, value => {
  if (!value) return;
  const next = { type: 'project', entity: value, region: mainRegion.value };
  if (!selected.value.entity) applySelection(next);
  expandedKeys.value = {
    [projectKey.value]: true,
    ...Object.fromEntries(childSections.value.map(section => [`section:${section.region.id}`, true]))
  };
}, { immediate: true });

watch(childSections, sections => {
  expandedKeys.value = {
    ...expandedKeys.value,
    ...Object.fromEntries(sections.map(section => [`section:${section.region.id}`, true]))
  };
  if (!selected.value.entity || selected.value.type === 'project') return;
  const stillVisible = sections.some(section => (
    section.entityType === selected.value.type
    && section.items.some(item => entityId(item) === entityId(selected.value.entity))
  ));
  if (!stillVisible) applySelection({ type: 'project', entity: project.value, region: mainRegion.value });
}, { deep: true });

function selectNode(node) {
  if (!node.data?.entity) return;
  applySelection(node.data);
}

function selectByKey(key) {
  const match = selectableEntities.value.find(item => item.key === key);
  if (match) applySelection(match);
}

function applySelection(value) {
  selected.value = { type: value.type, entity: value.entity, region: value.region };
  const key = entityKey(value.type, value.entity);
  selectionKeys.value = { [key]: true };
  mobileSelectedKey.value = key;
}

function sourceStateForRegion(region = {}) {
  return props.sourceState(region.sourceId) || {};
}

function collectionActions(section) {
  return [...new Set(section.region.actions || [])]
    .map(actionId => authStore.actionManifest.find(action => action.actionId === actionId))
    .filter(action => action?.actionKind === 'createEntity' && action.entityType === section.entityType);
}

function executeCollectionAction(action, section) {
  emit('execute-action', action, null, sectionActionContext(section));
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

function isLifecycleMutation(action = {}) {
  return action.actionKind === 'updateEntity' && Boolean(action.status?.to || action.access?.statusTo);
}

function entityKey(type, entity) {
  return `${type}:${entityId(entity)}`;
}

function entityId(entity = null) {
  return entity?._id || entity?.identity?.uid || '';
}
</script>
