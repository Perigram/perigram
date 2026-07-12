<template>
  <div v-if="collectionActions.length" class="flex justify-end gap-2">
    <GeneratedActionButton
      v-for="action in collectionActions"
      :key="action.actionId"
      :action-id="action.actionId"
      @execute="selectedAction => $emit('execute-action', selectedAction, null, actionContext)"
    />
  </div>
  <TableFrame v-if="template === 'table'">
    <DataTable :value="items" size="small" responsive-layout="scroll">
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
            class="min-w-0 max-w-full truncate text-left font-medium text-primary underline-offset-4 hover:underline"
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
  <ResponsiveGrid v-else :variant="template === 'workspaceLanes' ? 'wide' : 'cards'">
    <EntityCard
      v-for="entity in items"
      :key="entity._id || entity.id || entity.identity?.uid"
      :entity="entity"
      :entity-type="entityType"
      :surface="surface"
      variant="card"
      @refresh="$emit('refresh')"
    >
      <template v-if="detailRouteFor(entity)" #title>
        <div class="flex min-w-0 flex-col gap-2">
          <TraceChain :entity="entity" variant="compact" expandable />
          <div class="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div class="flex min-w-0 flex-1 items-center">
              <button
                type="button"
                class="min-w-0 max-w-full text-left text-primary underline-offset-4 hover:underline"
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
        suppress-child-counts
        relation-variant="compact"
      />
      <template v-if="entityType === 'cassette' || entityActionsFor(entity).length || entityCanDelete(entity) || detailRouteFor(entity)" #footer>
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
          <GeneratedCassetteDesignerAction
            v-if="entityType === 'cassette'"
            :entity="entity"
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
import { computed, provide } from 'vue';
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import EntityCard from '~/components/shared/EntityCard.vue';
import EntitySurfaceContent from '~/components/shared/EntitySurfaceContent.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import TraceChain from '~/components/shared/links/TraceChain.vue';
import ResponsiveGrid from '~/components/shared/ResponsiveGrid.vue';
import TableFrame from '~/components/shared/TableFrame.vue';
import GeneratedActionButton from '~/components/generated/GeneratedActionButton.vue';
import GeneratedCassetteDesignerAction from '~/components/generated/GeneratedCassetteDesignerAction.vue';
import GeneratedDeleteButton from '~/components/generated/GeneratedDeleteButton.vue';
import { useAuthStore } from '~/stores/auth';
import { useCutkitDomainUi } from '~/composables/useCutkitDomainUi.js';
import { resolveEntityDisplayContract } from '~/utils/entity-display-contract.js';
import { actionAppliesToEntity, isGeneratedSurfaceAction, parentBoundCreateAppliesToEntityType } from '~/components/generated/action-visibility.js';
import { mergeCollectionActionContext } from '~/components/generated/action-context.js';
import { canDeleteGeneratedEntity } from '~/components/generated/delete-visibility.js';
import { detailRouteForEntity } from '~/components/generated/entity-detail-routing.js';

const props = defineProps({
  entityType: { type: String, required: true },
  items: { type: Array, default: () => [] },
  surface: { type: String, default: 'card' },
  template: { type: String, default: 'entityList' },
  actions: { type: Array, default: () => [] },
  screenKey: { type: String, default: '' },
  region: { type: Object, default: () => ({}) },
  source: { type: Object, default: () => ({}) },
  actionContext: { type: Object, default: () => ({}) }
});

const emit = defineEmits(['refresh', 'execute-action']);

const authStore = useAuthStore();
const domainUi = useCutkitDomainUi();
provide('generatedExecuteAction', (action, entity, context = {}) => {
  emit('execute-action', action, entity, context);
});
const resolvedActions = computed(() => props.actions
  .map(actionId => authStore.actionManifest.find(action => action.actionId === actionId))
  .filter(Boolean));
const collectionActions = computed(() => dedupeActions([
  ...resolvedActions.value.filter(action => action.actionKind === 'createEntity')
]));
const actionContext = computed(() => mergeCollectionActionContext({
  incoming: props.actionContext || {},
  region: props.region,
  source: props.source,
  entityType: props.entityType,
  items: props.items
}));
const tableFields = computed(() => resolveEntityDisplayContract({
  entityType: props.entityType,
  surface: props.surface || 'table'
}).fields.slice(0, 6));

function entityActionsFor(entity) {
  return resolvedActions.value.filter(action => (
    isGeneratedSurfaceAction(action) &&
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
</script>
