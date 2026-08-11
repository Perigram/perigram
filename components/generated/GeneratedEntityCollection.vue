<template>
  <div class="flex min-w-0 flex-wrap items-center gap-2" data-collection-toolbar>
    <InputText
      v-model="searchQuery"
      :placeholder="$t('common.search')"
      class="min-w-40 flex-1"
    />
    <Select
      v-if="statusOptions.length > 1"
      v-model="statusFilter"
      :options="statusOptions"
      option-label="label"
      option-value="value"
      class="min-w-32"
      :aria-label="$t('common.filter')"
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
        :key="action.actionId"
        :action-id="action.actionId"
        @execute="selectedAction => $emit('execute-action', selectedAction, null, actionContext)"
      />
    </div>
  </div>
  <TableFrame v-if="template === 'table'">
    <DataTable :value="visibleItems" size="small" responsive-layout="scroll">
      <Column
        v-for="field in tableFields"
        :key="field.path"
        :field="field.path"
        :header="$t(field.i18n || field.path)"
      >
        <template #body="{ data }">
          <button
            v-if="isIdentityNameField(field.path) && detailRouteFor(data)"
            type="button"
            class="min-w-0 max-w-full truncate text-left font-medium text-[var(--ck-primary-ink)] underline-offset-4 hover:underline"
            @click="openEntity(data)"
          >
            {{ formatCell(data, field.path) }}
          </button>
          <template v-else>
            {{ formatCell(data, field.path) }}
          </template>
        </template>
      </Column>
    </DataTable>
  </TableFrame>
  <StateBlock v-else-if="visibleItems.length === 0" :message="$t('common.noResults')" icon="pi pi-search" />
  <ResponsiveGrid v-else :variant="template === 'workspaceLanes' ? 'wide' : 'bounded'" responsive-context="container">
    <EntityCard
      v-for="entity in visibleItems"
      :key="entity._id || entity.id || entity.identity?.uid"
      :entity="entity"
      :entity-type="entityType"
      :surface="surface"
      variant="card"
      :context-entity="actionContext.parentEntity"
      :context-entity-type="actionContext.parentEntityType"
      @refresh="$emit('refresh')"
    >
      <template v-if="detailRouteFor(entity)" #title>
        <div class="flex min-w-0 flex-col gap-2">
          <TraceChain :entity="entity" :entity-type="entityType" :exclude="traceExclusions" variant="compact" expandable />
          <div class="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div class="flex min-w-0 flex-1 items-center">
              <button
                type="button"
                class="min-w-0 max-w-full text-left text-[var(--ck-primary-ink)] underline-offset-4 hover:underline"
                @click.stop="openEntity(entity)"
              >
                <IdentityBlock :entity="entity" />
              </button>
            </div>
            <div v-if="entity.status" class="min-w-0 max-w-full shrink sm:max-w-56" @click.stop>
              <EntityStatus
                :entity="entity"
                :entity-type="entityType"
                variant="inline"
                @refresh="$emit('refresh')"
                @transitioned="$emit('refresh')"
              />
            </div>
          </div>
        </div>
      </template>
      <EntitySurfaceContent
        :entity="entity"
        :entity-type="entityType"
        :surface="surface"
        suppress-child-summaries
        relation-variant="compact"
      />
      <template v-if="hasEditorAction || entityActionsFor(entity).length || entityCanDelete(entity) || detailRouteFor(entity)" #footer>
        <div class="flex flex-wrap justify-end gap-2">
          <Button
            v-if="detailRouteFor(entity)"
            icon="pi pi-external-link"
            text
            rounded
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
            :key="action.actionId"
            :action-id="action.actionId"
            @execute="action => $emit('execute-action', action, entity, actionContext)"
          />
          <GeneratedDeleteButton
            :entity="entity"
            :entity-type="entityType"
            @deleted="$emit('refresh')"
          />
        </div>
      </template>
    </EntityCard>
  </ResponsiveGrid>
</template>

<script setup>
import { computed, provide, ref, watch } from 'vue';
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import InputText from 'primevue/inputtext';
import Select from '~/components/shared/EntitySelect.vue';
import { useI18n } from 'vue-i18n';
import EntityCard from '~/components/shared/EntityCard.vue';
import EntitySurfaceContent from '~/components/shared/EntitySurfaceContent.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import TraceChain from '~/components/shared/links/TraceChain.vue';
import ResponsiveGrid from '~/components/shared/ResponsiveGrid.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import TableFrame from '~/components/shared/TableFrame.vue';
import GeneratedActionButton from '~/components/generated/GeneratedActionButton.vue';
import { entityEditorActionFor, entityHasEditorAction } from '~/components/generated/entity-editor-action.js';
import GeneratedDeleteButton from '~/components/generated/GeneratedDeleteButton.vue';
import { useAuthStore } from '~/stores/auth';
import { useCutkitDomainUi } from '~/composables/useCutkitDomainUi.js';
import { resolveEntityDisplayContract } from '~/utils/entity-display-contract.js';
import { entityHierarchyIds } from '~/utils/entity-hierarchy.js';
import { actionAppliesToEntity, isGeneratedSurfaceAction, parentBoundCreateAppliesToEntityType } from '~/components/generated/action-visibility.js';
import { mergeCollectionActionContext } from '~/components/generated/action-context.js';
import { canDeleteGeneratedEntity } from '~/components/generated/delete-visibility.js';
import { detailRouteForEntity } from '~/components/generated/entity-detail-routing.js';
import { generatedActionRendersAt } from '~/components/generated/action-placement.js';

const props = defineProps({
  entityType: { type: String, required: true },
  items: { type: Array, default: () => [] },
  surface: { type: String, default: 'card' },
  template: { type: String, default: 'entityList' },
  actions: { type: Array, default: () => [] },
  screenKey: { type: String, default: '' },
  region: { type: Object, default: () => ({}) },
  source: { type: Object, default: () => ({}) },
  actionContext: { type: Object, default: () => ({}) },
  openInWorkspace: { type: Boolean, default: false }
});

const emit = defineEmits(['refresh', 'execute-action', 'open-entity', 'open-page']);

const authStore = useAuthStore();
const domainUi = useCutkitDomainUi();
const editorActionComponent = computed(() => entityEditorActionFor(props.entityType));
const hasEditorAction = computed(() => entityHasEditorAction(props.entityType));
const { t } = useI18n();
const searchQuery = ref('');
const statusFilter = ref('');
const sortBy = ref('name-asc');
provide('generatedExecuteAction', (action, entity, context = {}) => {
  emit('execute-action', action, entity, context);
});
const resolvedActions = computed(() => props.actions
  .map(actionId => authStore.actionManifest.find(action => action.actionId === actionId))
  .filter(Boolean));
const collectionActions = computed(() => dedupeActions([
  ...resolvedActions.value.filter(action => generatedActionRendersAt(action, 'collection'))
]));
const actionContext = computed(() => mergeCollectionActionContext({
  incoming: props.actionContext || {},
  region: props.region,
  source: props.source,
  entityType: props.entityType,
  items: props.items
}));
const traceExclusions = computed(() => {
  const entity = actionContext.value.parentEntity;
  if (!entity || !actionContext.value.parentEntityType) return [];
  return entityHierarchyIds(entity).map(id => ({
    type: actionContext.value.parentEntityType,
    id
  }));
});
const tableFields = computed(() => resolveEntityDisplayContract({
  entityType: props.entityType,
  surface: props.surface || 'table'
}).fields.slice(0, 6));
const statusOptions = computed(() => [
  { label: t('common.allStatuses'), value: '' },
  ...[...new Set(props.items.map(entityStatus).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right))
    .map(value => ({ label: value, value }))
]);
const sortOptions = computed(() => [
  { label: t('common.sortNameAsc'), value: 'name-asc' },
  { label: t('common.sortNameDesc'), value: 'name-desc' },
  { label: t('common.sortNewest'), value: 'date-desc' },
  { label: t('common.sortOldest'), value: 'date-asc' }
]);
const visibleItems = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase();
  return props.items
    .filter(entity => !statusFilter.value || entityStatus(entity) === statusFilter.value)
    .filter(entity => !query || entitySearchText(entity).includes(query))
    .slice()
    .sort(compareEntities);
});

watch(() => props.items, () => {
  if (statusFilter.value && !props.items.some(entity => entityStatus(entity) === statusFilter.value)) {
    statusFilter.value = '';
  }
});

function entityActionsFor(entity) {
  return resolvedActions.value.filter(action => (
    isGeneratedSurfaceAction(action) &&
    generatedActionRendersAt(action, ['entity', 'relation']) &&
    !parentBoundCreateAppliesToEntityType(action, props.entityType)
    && actionAppliesToEntity(action, entity, props.entityType)
  ));
}

function entityCanDelete(entity = {}) {
  return canDeleteGeneratedEntity({
    authStore,
    domainUi,
    entity,
    entityType: props.entityType
  });
}

function dedupeActions(actions = []) {
  return [...new Map(actions.map(action => [action.actionId || action.id, action])).values()];
}

function openEntity(entity) {
  if (props.openInWorkspace) {
    emit('open-entity', { entity, entityType: props.entityType });
    return;
  }
  const route = detailRouteFor(entity);
  if (route) navigateTo(route);
}

function detailRouteFor(entity) {
  return detailRouteForEntity({
    entity,
    entityType: props.entityType,
    screenKey: props.screenKey,
    manifest: authStore.screenManifest
  });
}

function isIdentityNameField(path) {
  return path === 'identity.name';
}

function formatCell(entity, path) {
  const value = String(path || '').split('.').filter(Boolean).reduce((item, key) => item?.[key], entity);
  if (value === undefined || value === null || value === '') return '';
  if (Array.isArray(value)) return value.length;
  if (typeof value === 'object') return value.name || value.label || value.uid || value._id || '';
  return String(value);
}

function entityStatus(entity = {}) {
  return entity.status?.state?.primary
    || entity.status?.state?.active?.main
    || entity.status?.lifecycle?.state
    || (typeof entity.status?.state === 'string' ? entity.status.state : '')
    || (typeof entity.status === 'string' ? entity.status : '');
}

function entityName(entity = {}) {
  return entity.identity?.name || entity.identity?.slug || entity.identity?.uid || entity._id || entity.id || '';
}

function entitySearchText(entity = {}) {
  return [entityName(entity), entity.identity?.slug, entity.identity?.uid, entityStatus(entity)]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase();
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
