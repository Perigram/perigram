<template>
  <div class="flex min-w-0 flex-wrap items-center gap-2" data-collection-toolbar>
    <InputText
      v-model="searchQuery"
      :placeholder="$t('common.search')"
      class="min-w-40 flex-1"
    />
    <FilterBuilder
      v-if="builderFields.length"
      :model-value="builderFilter"
      :fields="builderFields"
      @update:model-value="setBuilderFilter"
    />
    <Select
      v-model="sortBy"
      :options="sortOptions"
      option-label="label"
      option-value="value"
      class="min-w-36"
      :aria-label="$t('common.sort')"
    />
    <div v-if="collectionActions.length" class="ml-auto flex flex-wrap items-center gap-2">
      <GeneratedActionButton
        v-for="action in collectionActions"
        :key="action.id"
        :action-id="action.id"
        @execute="selectedAction => $emit('execute-action', selectedAction, null, actionContext)"
      />
    </div>
  </div>
  <TableFrame v-if="template === 'table'" class="ck-collection-rows">
    <DataTable :value="visibleItems" size="small" responsive-layout="scroll" :pt="tablePt" :row-class="rowSurfaceClass">
      <Column
        v-for="field in tableFields"
        :key="field.path"
        :field="field.path"
        :header="$t(field.i18n || field.path)"
      >
        <template #body="{ data }">
          <Button
            v-if="isIdentityNameField(field.path) && detailRouteFor(data)"
            link
            class="min-w-0 max-w-full !justify-start text-label"
            :aria-label="formatCell(data, field.path)"
            @click="openEntity(data)"
          >
            {{ formatCell(data, field.path) }}
          </Button>
          <template v-else>
            {{ formatCell(data, field.path) }}
          </template>
        </template>
      </Column>
    </DataTable>
  </TableFrame>
  <StateBlock v-else-if="visibleItems.length === 0" :message="$t('common.noResults')" icon="pi pi-search" />
  <ResponsiveGrid v-else :variant="template === 'workspaceLanes' ? 'wide' : 'bounded'" responsive-context="container">
    <InstanceCard
      v-for="entity in visibleItems"
      :key="entity._id || entity.id || entity.identity?.uid"
      :entity="entity"
      :type-id="typeId"
      :surface="surface"
      variant="card"
      :context-entity="actionContext.parentEntity"
      :context-type-id="actionContext.parentTypeId"
      @refresh="$emit('refresh')"
    >
      <template v-if="detailRouteFor(entity)" #title>
        <div class="flex min-w-0 flex-col gap-2">
          <TraceChain :entity="entity" :type-id="typeId" :exclude="traceExclusions" variant="compact" expandable />
          <div class="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div class="flex min-w-0 flex-1 items-center">
              <Button
                link
                class="min-w-0 max-w-full !justify-start"
                :aria-label="entity.identity?.name || $t('common.open')"
                @click.stop="openEntity(entity)"
              >
                <span class="flex min-w-0 items-center gap-2">
                  <i v-if="entityIcon" :class="entityIcon" class="shrink-0 text-muted" aria-hidden="true"></i>
                  <span class="truncate" :title="identityLabel(entity)">{{ identityLabel(entity) }}</span>
                </span>
              </Button>
            </div>
            <div v-if="entity.status" class="min-w-0 max-w-full shrink sm:max-w-56" @click.stop>
              <InstanceState
                :entity="entity"
                :type-id="typeId"
                variant="inline"
                @refresh="$emit('refresh')"
                @transitioned="$emit('refresh')"
              />
            </div>
          </div>
        </div>
      </template>
      <InstanceSurfaceContent
        :entity="entity"
        :type-id="typeId"
        :surface="surface"
        suppress-child-summaries
        relation-variant="compact"
      />
      <template #footer>
        <div class="flex flex-wrap justify-end gap-2">
          <Button
            v-if="detailRouteFor(entity)"
            :label="$t('common.open')"
            icon="pi pi-external-link"
            text
            size="small"
            :aria-label="$t('common.open')"
            @click.stop="openEntity(entity)"
          />
          <component
            :is="editorActionComponent"
            v-if="editorActionComponent"
            :entity="entity"
            :open-in-workspace="openInWorkspace"
            @open-page="page => $emit('open-page', page)"
            @refresh="$emit('refresh')"
          />
          <GeneratedActionButton
            v-for="action in entityActionsFor(entity)"
            :key="action.id"
            :action-id="action.id"
            @execute="action => $emit('execute-action', action, entity, actionContext)"
          />
        </div>
      </template>
    </InstanceCard>
  </ResponsiveGrid>
</template>

<script setup>
import { computed, provide, ref, watch } from 'vue';
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import InputText from 'primevue/inputtext';
import Select from '~/components/shared/InstanceSelect.vue';
import FilterBuilder from '~/components/shared/FilterBuilder.vue';
import { normalizeFilter, instanceMatchesFilter } from '#shared/instance-filters/index.js';
import { loadFilterViewState, storeFilterViewState } from '~/utils/filter-view-state.js';
import { builderFieldsForType } from '#shared/ui-mapping/index.js';
import { useInstancesStore } from '~/stores/instances';
import { useI18n } from 'vue-i18n';
import InstanceCard from '~/components/shared/InstanceCard.vue';
import InstanceSurfaceContent from '~/components/shared/InstanceSurfaceContent.vue';
import InstanceState from '~/components/shared/state/InstanceState.vue';
import TraceChain from '~/components/shared/links/TraceChain.vue';
import ResponsiveGrid from '~/components/shared/ResponsiveGrid.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import TableFrame from '~/components/shared/TableFrame.vue';

// The shared table row-surface recipe: rounded content rows (paint comes
// from the preset) over a transparent table box with hairline separated
// gaps and a muted transparent header band.
const tablePt = {
  root: { class: 'bg-transparent' },
  headerRow: { class: 'bg-transparent text-muted' },
  headerCell: { class: 'bg-transparent text-muted' }
};
const rowSurfaceClass = () => 'rounded-ui ring-1 ring-inset ring-content-border';
import GeneratedActionButton from '~/components/generated/GeneratedActionButton.vue';
import { openInstanceInWorkspace } from '~/utils/instance-workspace-open.js';
import { instanceEditorActionFor, instanceHasEditorAction } from '~/components/generated/instance-editor-action.js';
import { useAuthStore } from '~/stores/auth';
import { resolveInstanceDisplayContract } from '~/utils/instance-display-contract.js';
import { titleFor } from '#shared/ui-mapping/index.js';
import { dtoToScreenInstance } from '~/utils/instance-shape.js';
import { useFileTypeView } from '~/composables/useFileTypeView.js';
import { instanceHierarchyIds } from '~/utils/instance-hierarchy.js';
import { actionAppliesToEntity, isGeneratedSurfaceAction, parentBoundCreateAppliesToTypeId } from '~/components/generated/action-visibility.js';
import { mergeCollectionActionContext } from '~/components/generated/action-context.js';
import { detailRouteForInstance } from '~/components/generated/instance-detail-routing.js';
import { useRegistryStore } from '~/stores/registry';
import { loadSortPreference, storeSortPreference } from '~/utils/ui-sort-preference.js';
import { generatedActionRendersAt } from '~/components/generated/action-placement.js';

const props = defineProps({
  typeId: { type: String, required: true },
  items: { type: Array, default: () => [] },
  surface: { type: String, default: 'card' },
  template: { type: String, default: 'typeList' },
  actions: { type: Array, default: () => [] },
  screenKey: { type: String, default: '' },
  region: { type: Object, default: () => ({}) },
  source: { type: Object, default: () => ({}) },
  actionContext: { type: Object, default: () => ({}) },
  openInWorkspace: { type: Boolean, default: false }
});

const emit = defineEmits(['refresh', 'execute-action', 'open-entity', 'open-page']);

const authStore = useAuthStore();
const editorActionComponent = computed(() => instanceEditorActionFor(props.typeId));
const hasEditorAction = computed(() => instanceHasEditorAction(props.typeId));
const registry = useRegistryStore();
const entityIcon = computed(() => registry.iconFor(props.typeId));
const { t } = useI18n();
const searchQuery = ref('');
// The last sort choice persists per type; the identity-ascending default
// applies when no preference exists.
const sortScope = computed(() => `collection:${props.typeId}`);
const sortBy = ref(loadSortPreference(sortScope.value)?.name || 'name-asc');
watch(sortBy, value => {
  if (value) storeSortPreference(sortScope.value, { name: value, order: 1 });
});
provide('generatedExecuteAction', (action, entity, context = {}) => {
  emit('execute-action', action, entity, context);
});
const resolvedActions = computed(() => props.actions
  .map(actionId => authStore.actionManifest.find(action => action.id === actionId))
  .filter(Boolean));
const collectionActions = computed(() => dedupeActions([
  ...resolvedActions.value.filter(action => generatedActionRendersAt(action, 'collection'))
]));
const actionContext = computed(() => mergeCollectionActionContext({
  incoming: props.actionContext || {},
  region: props.region,
  source: props.source,
  typeId: props.typeId,
  items: props.items
}));
const traceExclusions = computed(() => {
  const entity = actionContext.value.parentEntity;
  if (!entity || !actionContext.value.parentTypeId) return [];
  return instanceHierarchyIds(entity).map(id => ({
    type: actionContext.value.parentTypeId,
    id
  }));
});
const { typeById } = useFileTypeView();
const tableFields = computed(() => resolveInstanceDisplayContract({
  typeId: props.typeId,
  surface: props.surface || 'table',
  typeRecord: typeById(props.typeId)
}).fields.slice(0, 6));
const statusValues = computed(() => [...new Set(props.items.map(entityStatus).filter(Boolean))]
  .sort((left, right) => left.localeCompare(right)));
const sortOptions = computed(() => [
  { label: t('common.sortNameAsc'), value: 'name-asc' },
  { label: t('common.sortNameDesc'), value: 'name-desc' },
  { label: t('common.sortNewest'), value: 'date-desc' },
  { label: t('common.sortOldest'), value: 'date-asc' }
]);
// Builder view state: the user's composed filter tree for this
// collection, persisted per scope as presentation data (never a process
// contract). It conjoins with the quick controls above.
const viewScope = computed(() => `collection:${props.typeId}`);
const builderFilter = ref(loadFilterViewState(viewScope.value));
watch(viewScope, scope => {
  builderFilter.value = loadFilterViewState(scope);
});
// Filterable fields: every scalar field of the type plus relation,
// parent, and children traversal axes over the registry's type view, with
// the primary status over the states actually present.
const builderFields = computed(() => [
  {
    name: 'states.main',
    label: t('uiMapping.fieldStatus'),
    kind: 'enum',
    values: statusValues.value
  },
  ...builderFieldsForType(typeRecord.value, { bundle: { types: registryTypes.value } })
].filter(field => field.kind !== 'enum' || field.values.length));
function setBuilderFilter(filter) {
  builderFilter.value = filter;
  storeFilterViewState(viewScope.value, filter);
}
// The §3 screen-instance projection the filter tree evaluates against:
// dtoToScreenInstance when the registry knows the type, else the identity
// shell. Legacy status shapes resolve through the same resolver the status
// options derive from, so the status axis never depends on registry
// presence.
const typeRecord = computed(() => typeById(props.typeId));
const registryTypes = computed(() => [...registry.typesById.values()]);
const filterRows = computed(() => new Map(props.items.map(entity => {
  const projected = (typeRecord.value ? dtoToScreenInstance(entity, typeRecord.value) : null) || {
    id: String(entity?._id || entity?.id || entity?.identity?.uid || ''),
    fields: {},
    lineage: {},
    relations: {}
  };
  const status = entityStatus(entity);
  if (status && !projected.states?.main) projected.states = { main: status };
  return [entity, projected];
})));
const activeFilter = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  return normalizeFilter({
    and: [
      query
        ? {
          or: [
            { field: 'name', op: 'contains', value: query },
            { field: 'id', op: 'contains', value: query }
          ]
        }
        : null,
      builderFilter.value
    ].filter(Boolean)
  });
});
const instancesStore = useInstancesStore();
const filterContext = computed(() => ({ pool: instancesStore.instancePool }));
const visibleItems = computed(() => props.items
  .filter(entity => instanceMatchesFilter(filterRows.value.get(entity), activeFilter.value, filterContext.value))
  .slice()
  .sort(compareEntities));

function entityActionsFor(entity) {
  return resolvedActions.value.filter(action => (
    isGeneratedSurfaceAction(action) &&
    generatedActionRendersAt(action, ['entity', 'relation']) &&
    !parentBoundCreateAppliesToTypeId(action, props.typeId)
    && actionAppliesToEntity(action, entity, props.typeId)
  ));
}

function dedupeActions(actions = []) {
  return [...new Map(actions.map(action => [action.id, action])).values()];
}

function openEntity(entity) {
  if (props.openInWorkspace) {
    emit('open-entity', { entity, typeId: props.typeId });
    return;
  }
  // Desktop standalone lists open entities inside the home workspace
  // instead of a separate route.
  if (typeof window !== 'undefined'
    && !window.matchMedia?.('(max-width: 767px)')?.matches) {
    const id = entity?._id || entity?.id || entity?.identity?.uid || '';
    if (openInstanceInWorkspace({ typeId: props.typeId, instanceId: String(id || '') })) return;
  }
  const route = detailRouteFor(entity);
  if (route) navigateTo(route);
}

function detailRouteFor(entity) {
  return detailRouteForInstance({
    entity,
    typeId: props.typeId,
    screenKey: props.screenKey,
    manifest: authStore.screenManifest
  });
}

function isIdentityNameField(path) {
  return path === 'identity.name';
}

function identityLabel(entity) {
  const typeRecord = typeById(props.typeId);
  return titleFor(
    typeRecord ? dtoToScreenInstance(entity, typeRecord) : null,
    typeRecord,
    { unnamedLabel: t('common.unnamed') }
  );
}

function formatCell(entity, path) {
  const value = String(path || '').split('.').filter(Boolean).reduce((item, key) => item?.[key], entity);
  if (value === undefined || value === null || value === '') return '';
  if (Array.isArray(value)) return value.length;
  if (typeof value === 'object') return value.name || value.label || value.uid || value._id || '';
  return String(value);
}

function entityStatus(entity = {}) {
  return entity.states?.main
    || entity.states?.active?.main
    || entity.status?.lifecycle?.state
    || (typeof entity.states === 'string' ? entity.status.state : '')
    || (typeof entity.status === 'string' ? entity.status : '');
}

function entityName(entity = {}) {
  return entity.identity?.name || entity.identity?.slug || entity.identity?.uid || entity._id || entity.id || '';
}

function compareEntities(left, right) {
  if (sortBy.value === 'name-desc') return entityName(right).localeCompare(entityName(left));
  if (sortBy.value === 'date-desc') return entityTimestamp(right) - entityTimestamp(left);
  if (sortBy.value === 'date-asc') return entityTimestamp(left) - entityTimestamp(right);
  return entityName(left).localeCompare(entityName(right));
}

function entityTimestamp(entity = {}) {
  const value = Date.parse(entity.updatedAt || entity.createdAt || '');
  return Number.isNaN(value) ? 0 : value;
}
</script>


<style scoped>
/* Row-surface rhythm (layout-only declarations): the shared recipe —
   separated cell borders leave a hairline gap between rounded rows. */
.ck-collection-rows :deep(.p-datatable-table) {
  border-collapse: separate;
  border-spacing: 0 0.25rem;
}
</style>
