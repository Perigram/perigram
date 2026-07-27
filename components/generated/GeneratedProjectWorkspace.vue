<template>
  <EntityPage
    v-if="project"
    :entity="project"
    entity-type="project"
    show-trace
    @refresh="$emit('refresh')"
  >
    <template #info>
      <span v-if="project.data?.address">{{ project.data.address }}</span>
      <span>{{ project.summary?.queueCount || queueCount }} {{ $t('project.queues') }}</span>
      <span>{{ project.summary?.totalArea || 0 }} m²</span>
    </template>

    <template v-if="headerActionIds.length || projectCanDelete" #actions>
      <GeneratedActionButton
        v-for="actionId in headerActionIds"
        :key="actionId"
        :action-id="actionId"
        @execute="action => $emit('execute-action', action, project, projectActionContext)"
      />
      <GeneratedDeleteButton
        :entity="project"
        entity-type="project"
        @deleted="$emit('refresh')"
      />
    </template>

    <div class="grid min-h-[32rem] grid-cols-1 gap-4 xl:grid-cols-[18rem_minmax(0,1fr)_20rem]">
      <Panel>
        <template #header>
          <div class="flex min-w-0 items-center gap-2">
            <i class="pi pi-sitemap"></i>
            <span class="truncate">{{ $t('project.linkedEntities') }}</span>
          </div>
        </template>
        <div class="flex flex-col gap-3">
          <button
            type="button"
            :class="nodeClass(selectedKey === projectKey)"
            @click="selectEntity('project', project, mainRegion)"
          >
            <EntityInlineRef
              type="project"
              :entity="project"
              :fetch="false"
              :allow-detail-route="false"
              :interactive="false"
              variant="compact"
            />
          </button>

          <div v-for="section in childSections" :key="section.region.id" class="flex flex-col gap-2">
            <div class="flex items-center justify-between gap-2">
              <small class="text-muted-color">{{ sectionLabel(section) }}</small>
              <div v-if="collectionActions(section).length" class="flex shrink-0 gap-1">
                <GeneratedActionButton
                  v-for="action in collectionActions(section)"
                  :key="action.actionId"
                  :action-id="action.actionId"
                  @execute="selectedAction => $emit('execute-action', selectedAction, null, sectionActionContext(section))"
                />
              </div>
            </div>

            <div v-if="section.items.length" class="flex flex-col gap-1">
              <button
                v-for="entity in section.items"
                :key="entityKey(section.entityType, entity)"
                type="button"
                :class="nodeClass(selectedKey === entityKey(section.entityType, entity))"
                @click="selectEntity(section.entityType, entity, section.region)"
              >
                <EntityInlineRef
                  :type="section.entityType"
                  :entity="entity"
                  :fetch="false"
                  :allow-detail-route="false"
                  :interactive="false"
                  variant="compact"
                />
              </button>
            </div>
            <StateBlock
              v-else
              :message="$t('common.noResults')"
              icon="pi pi-inbox"
            />
          </div>
        </div>
      </Panel>

      <Panel>
        <template #header>
          <div class="flex min-w-0 items-center gap-2">
            <i class="pi pi-window-maximize"></i>
            <span class="truncate">{{ $t('project.selectedPane') }}</span>
          </div>
        </template>
        <div v-if="selectedEntity" class="flex flex-col gap-4">
          <EntityCard
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
            <template v-if="selectedActionIds.length" #footer>
              <div class="flex flex-wrap justify-end gap-2">
                <GeneratedActionButton
                  v-for="actionId in selectedActionIds"
                  :key="actionId"
                  :action-id="actionId"
                  @execute="action => $emit('execute-action', action, selectedEntity, selectedActionContext)"
                />
              </div>
            </template>
          </EntityCard>
        </div>
        <StateBlock
          v-else
          :message="$t('common.noResults')"
          icon="pi pi-inbox"
        />
      </Panel>

      <div class="flex flex-col gap-4">
        <Panel>
          <template #header>
            <div class="flex min-w-0 items-center gap-2">
              <i class="pi pi-folder"></i>
              <span class="truncate">{{ $t('project.projectContext') }}</span>
            </div>
          </template>
          <EntitySurfaceContent
            :entity="project"
            entity-type="project"
            surface="detail"
            :display-extensions="appEntityDisplayExtensions"
            relation-variant="compact"
          />
        </Panel>

        <Panel :header="$t('project.lifecycle')">
          <StatusHistory :entity="project" entity-type="project" compact />
        </Panel>
      </div>
    </div>
  </EntityPage>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import Panel from 'primevue/panel';
import { useI18n } from 'vue-i18n';
import EntityCard from '~/components/shared/EntityCard.vue';
import EntityInlineRef from '~/components/shared/EntityInlineRef.vue';
import EntityPage from '~/components/shared/EntityPage.vue';
import EntitySurfaceContent from '~/components/shared/EntitySurfaceContent.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import StatusHistory from '~/components/shared/status/StatusHistory.vue';
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

defineEmits(['refresh', 'execute-action']);

const authStore = useAuthStore();
const domainUi = useCutkitDomainUi();
const { t, te } = useI18n();
const selected = ref({ type: 'project', entity: null, region: null });

const mainRegion = computed(() => props.screen.regions.find(region => sourceStateForRegion(region).source?.mode === 'single') || props.screen.regions[0] || null);
const project = computed(() => mainRegion.value ? sourceStateForRegion(mainRegion.value).entity : null);
const projectKey = computed(() => entityKey('project', project.value));
const projectActionContext = computed(() => ({
  parentEntityType: 'project',
  parentEntity: project.value,
  parentEntityId: entityId(project.value)
}));
const childSections = computed(() => props.screen.regions
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
const queueCount = computed(() => childSections.value
  .find(section => section.entityType === 'queue')?.items.length || 0);
const selectedEntity = computed(() => selected.value.entity || project.value);
const selectedEntityType = computed(() => selected.value.entity ? selected.value.type : 'project');
const selectedRegion = computed(() => selected.value.region || mainRegion.value);
const selectedKey = computed(() => entityKey(selectedEntityType.value, selectedEntity.value));
const selectedSurface = computed(() => selectedEntityType.value === 'project' ? 'detail' : 'card');
const resolvedActions = computed(() => props.screenActions
  .map(actionId => authStore.actionManifest.find(action => action.actionId === actionId))
  .filter(Boolean));
const headerActionIds = computed(() => resolvedActions.value
  .filter(isGeneratedSurfaceAction)
  .filter(action => actionAppliesToEntity(action, project.value, 'project'))
  .map(action => action.actionId));
const selectedActionIds = computed(() => resolvedActions.value
  .filter(() => selectedEntityType.value !== 'project')
  .filter(isGeneratedSurfaceAction)
  .filter(action => actionAppliesToEntity(action, selectedEntity.value, selectedEntityType.value))
  .map(action => action.actionId));
const selectedActionContext = computed(() => selectedRegion.value
  ? sectionActionContext({ region: selectedRegion.value, source: sourceStateForRegion(selectedRegion.value).source, entityType: selectedEntityType.value, items: [] })
  : projectActionContext.value);
const projectCanDelete = computed(() => canDeleteGeneratedEntity({
  authStore,
  domainUi,
  entity: project.value,
  entityType: 'project'
}));

watch(project, value => {
  if (!selected.value.entity && value) selected.value = { type: 'project', entity: value, region: mainRegion.value };
}, { immediate: true });

watch(childSections, sections => {
  if (!selected.value.entity || selected.value.type === 'project') return;
  const stillVisible = sections.some(section => (
    section.entityType === selected.value.type
    && section.items.some(item => entityId(item) === entityId(selected.value.entity))
  ));
  if (!stillVisible) selected.value = { type: 'project', entity: project.value, region: mainRegion.value };
}, { deep: true });

function selectEntity(type, entity, region) {
  selected.value = { type, entity, region };
}

function sourceStateForRegion(region = {}) {
  return props.sourceState(region.sourceId) || {};
}

function sectionLabel(section) {
  return generatedEntityLabel(section.entityType, { t, te });
}

function collectionActions(section) {
  const actionIds = [...new Set([...(section.region.actions || []), ...(props.screenActions || [])])];
  return actionIds
    .map(actionId => authStore.actionManifest.find(action => action.actionId === actionId))
    .filter(action => action?.actionKind === 'createEntity' && action.entityType === section.entityType);
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

function nodeClass(active) {
  return [
    'w-full rounded-md border p-2 text-left transition-colors',
    active ? 'border-primary bg-subtle' : 'border-content-border hover:border-primary'
  ];
}

function entityKey(type, entity) {
  return `${type}:${entityId(entity)}`;
}

function entityId(entity = null) {
  return entity?._id || entity?.identity?.uid || entity?.id || '';
}
</script>
