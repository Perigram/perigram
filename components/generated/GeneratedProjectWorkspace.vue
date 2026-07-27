<template>
  <EntityPage
    v-if="project"
    :entity="project"
    entity-type="project"
    show-trace
    @refresh="$emit('refresh')"
  >
    <div class="overflow-hidden rounded-panel border border-content-border bg-content">
      <div class="grid min-h-[36rem] grid-cols-1 lg:h-[calc(100vh-15rem)] lg:grid-cols-[17rem_minmax(0,1fr)_19rem] lg:divide-x lg:divide-content-border">
        <aside class="flex min-h-0 flex-col border-b border-content-border lg:border-b-0">
          <div class="flex h-10 shrink-0 items-center justify-between border-b border-content-border px-3">
            <span class="text-xs font-semibold uppercase tracking-wide">{{ $t('project.explorer') }}</span>
            <Button
              icon="pi pi-refresh"
              text
              rounded
              size="small"
              :aria-label="$t('common.refresh')"
              @click="$emit('refresh')"
            />
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto py-1">
            <button
              type="button"
              :class="explorerRowClass(selectedKey === projectKey)"
              @click="selectEntity('project', project, mainRegion)"
            >
              <i class="pi pi-folder-open shrink-0"></i>
              <IdentityBlock :entity="project" variant="compact" class="min-w-0 flex-1" />
            </button>

            <section v-for="section in childSections" :key="section.region.id">
              <div class="flex h-8 items-center gap-1 px-2">
                <i class="pi pi-angle-down text-xs"></i>
                <span class="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide">
                  {{ sectionLabel(section) }}
                </span>
                <span class="text-xs text-muted-color">{{ section.items.length }}</span>
                <GeneratedActionButton
                  v-for="action in collectionActions(section)"
                  :key="action.actionId"
                  :action-id="action.actionId"
                  icon-only
                  @execute="selectedAction => $emit('execute-action', selectedAction, null, sectionActionContext(section))"
                />
              </div>

              <button
                v-for="entity in section.items"
                :key="entityKey(section.entityType, entity)"
                type="button"
                :class="explorerRowClass(selectedKey === entityKey(section.entityType, entity), true)"
                @click="selectEntity(section.entityType, entity, section.region)"
              >
                <i :class="[domainUi.getIcon(section.entityType), 'shrink-0']"></i>
                <IdentityBlock :entity="entity" variant="compact" class="min-w-0 flex-1" />
              </button>

              <div v-if="!section.items.length" class="px-7 py-2 text-xs text-muted-color">
                {{ $t('common.noResults') }}
              </div>
            </section>

            <section v-for="section in relationSections" :key="section.relation.key">
              <div class="flex h-8 items-center gap-1 px-2">
                <i class="pi pi-angle-down text-xs"></i>
                <span class="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide">
                  {{ relationSectionLabel(section) }}
                </span>
                <span class="text-xs text-muted-color">{{ section.items.length }}</span>
                <GeneratedActionButton
                  v-for="action in section.actions"
                  :key="action.actionId"
                  :action-id="action.actionId"
                  icon-only
                  @execute="selectedAction => $emit('execute-action', selectedAction, project, projectActionContext)"
                />
              </div>

              <div v-for="item in section.items" :key="`${section.relation.key}:${item.id}`" class="px-5 py-0.5">
                <EntityInlineRef
                  :type="item.type"
                  :id="item.id"
                  :entity="item.entity"
                  :fetch="!item.entity"
                  variant="inline"
                />
              </div>

              <div v-if="!section.items.length" class="px-7 py-2 text-xs text-muted-color">
                {{ $t('common.noResults') }}
              </div>
            </section>
          </div>
        </aside>

        <main class="flex min-h-0 min-w-0 flex-col border-b border-content-border lg:border-b-0">
          <div class="flex h-10 shrink-0 items-center gap-2 border-b border-content-border px-3">
            <i :class="[domainUi.getIcon(selectedEntityType), 'shrink-0']"></i>
            <IdentityBlock v-if="selectedEntity" :entity="selectedEntity" variant="compact" class="min-w-0 flex-1" />
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto p-4">
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
          </div>
        </main>

        <aside class="flex min-h-0 flex-col">
          <div class="flex h-10 shrink-0 items-center border-b border-content-border px-3">
            <span class="text-xs font-semibold uppercase tracking-wide">{{ $t('project.inspector') }}</span>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto">
            <section v-if="selectedOperations.length || selectedCanDelete" class="border-b border-content-border p-3">
              <div class="mb-2 text-xs font-semibold uppercase tracking-wide">{{ $t('project.operations') }}</div>
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
            </section>

            <section class="p-3">
              <div class="mb-2 text-xs font-semibold uppercase tracking-wide">{{ $t('project.lifecycle') }}</div>
              <StatusHistory
                :key="selectedKey"
                :entity="selectedEntity"
                :entity-type="selectedEntityType"
                compact
              />
            </section>
          </div>
        </aside>
      </div>
    </div>
  </EntityPage>
</template>

<script setup>
import { computed, provide, ref, watch } from 'vue';
import Button from 'primevue/button';
import { useI18n } from 'vue-i18n';
import { cncRelations } from '@cutkit/domain-cnc';
import EntityCard from '~/components/shared/EntityCard.vue';
import EntityInlineRef from '~/components/shared/EntityInlineRef.vue';
import EntityPage from '~/components/shared/EntityPage.vue';
import EntitySurfaceContent from '~/components/shared/EntitySurfaceContent.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import StatusHistory from '~/components/shared/status/StatusHistory.vue';
import GeneratedActionButton from '~/components/generated/GeneratedActionButton.vue';
import GeneratedDeleteButton from '~/components/generated/GeneratedDeleteButton.vue';
import { actionAppliesToEntity } from '~/components/generated/action-visibility.js';
import { canDeleteGeneratedEntity } from '~/components/generated/delete-visibility.js';
import { mergeCollectionActionContext } from '~/components/generated/action-context.js';
import {
  isProjectWorkspaceOperation,
  relationKeysForAction,
  relationValues,
  uniqueActionIds
} from '~/components/generated/project-workspace.js';
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

provide('generatedExecuteAction', (action, entity, context = {}) => {
  emit('execute-action', action, entity, context);
});

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
const selectedEntity = computed(() => selected.value.entity || project.value);
const selectedEntityType = computed(() => selected.value.entity ? selected.value.type : 'project');
const selectedRegion = computed(() => selected.value.region || mainRegion.value);
const selectedKey = computed(() => entityKey(selectedEntityType.value, selectedEntity.value));
const selectedSurface = computed(() => selectedEntityType.value === 'project' ? 'detail' : 'card');
const resolvedActions = computed(() => uniqueActionIds(
  props.screenActions,
  ...(props.screen.regions || []).map(region => region.actions || [])
).map(actionId => authStore.actionManifest.find(action => action.actionId === actionId)).filter(Boolean));
const projectActions = computed(() => resolvedActions.value
  .filter(isProjectWorkspaceOperation)
  .filter(action => actionAppliesToEntity(action, project.value, 'project')));
const relationSections = computed(() => cncRelations
  .filter(relation => relation.ownerType === 'project')
  .map(relation => ({
    relation,
    items: relationValues(project.value, relation),
    actions: projectActions.value.filter(action => relationKeysForAction(action, 'project').includes(relation.key))
  }))
  .filter(section => section.items.length || section.actions.length));
const placedProjectActionIds = computed(() => new Set([
  ...childSections.value.flatMap(section => collectionActions(section).map(action => action.actionId)),
  ...relationSections.value.flatMap(section => section.actions.map(action => action.actionId))
]));
const selectedOperations = computed(() => {
  if (!selectedEntity.value) return [];
  const ids = uniqueActionIds(props.screenActions, selectedRegion.value?.actions || []);
  return ids
    .map(actionId => authStore.actionManifest.find(action => action.actionId === actionId))
    .filter(Boolean)
    .filter(isProjectWorkspaceOperation)
    .filter(action => actionAppliesToEntity(action, selectedEntity.value, selectedEntityType.value))
    .filter(action => selectedEntityType.value !== 'project' || !placedProjectActionIds.value.has(action.actionId));
});
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

function relationSectionLabel(section) {
  const key = `project.${section.relation.key}`;
  return te(key) ? t(key) : generatedEntityLabel(section.relation.targetType, { t, te });
}

function collectionActions(section) {
  return uniqueActionIds(section.region.actions || [], props.screenActions)
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

function explorerRowClass(active, nested = false) {
  return [
    'flex w-full min-w-0 items-center gap-2 border-l-2 py-1.5 pr-2 text-left',
    nested ? 'pl-7' : 'pl-2',
    active ? 'border-primary bg-subtle' : 'border-transparent hover:bg-subtle'
  ];
}

function entityKey(type, entity) {
  return `${type}:${entityId(entity)}`;
}

function entityId(entity = null) {
  return entity?._id || entity?.identity?.uid || '';
}
</script>
