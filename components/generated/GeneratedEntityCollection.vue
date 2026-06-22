<template>
  <div v-if="collectionActions.length" class="flex justify-end gap-2">
    <GeneratedActionButton
      v-for="action in collectionActions"
      :key="action.actionId"
      :action-id="action.actionId"
      @execute="item => $emit('execute-action', item, null)"
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
          {{ formatCell(data, field.path) }}
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
      <EntitySurfaceContent :entity="entity" :entity-type="entityType" :surface="surface" />
      <template v-if="actions.length" #footer>
        <div class="flex flex-wrap justify-end gap-2">
          <GeneratedActionButton
            v-for="action in entityActions"
            :key="action.actionId"
            :action-id="action.actionId"
            @execute="action => $emit('execute-action', action, entity)"
          />
        </div>
      </template>
    </EntityCard>
  </ResponsiveGrid>
</template>

<script setup>
import { computed } from 'vue';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import EntityCard from '~/components/shared/EntityCard.vue';
import EntitySurfaceContent from '~/components/shared/EntitySurfaceContent.vue';
import ResponsiveGrid from '~/components/shared/ResponsiveGrid.vue';
import TableFrame from '~/components/shared/TableFrame.vue';
import GeneratedActionButton from '~/components/generated/GeneratedActionButton.vue';
import { useAuthStore } from '~/stores/auth';
import { resolveEntityDisplayContract } from '~/utils/entity-display-contract.js';

const props = defineProps({
  entityType: { type: String, required: true },
  items: { type: Array, default: () => [] },
  surface: { type: String, default: 'card' },
  template: { type: String, default: 'entityList' },
  actions: { type: Array, default: () => [] }
});

defineEmits(['refresh', 'execute-action']);

const authStore = useAuthStore();
const resolvedActions = computed(() => props.actions
  .map(actionId => authStore.actionManifest.find(action => action.actionId === actionId))
  .filter(Boolean));
const collectionActions = computed(() => resolvedActions.value.filter(action => action.actionKind === 'createEntity'));
const entityActions = computed(() => resolvedActions.value.filter(action => action.actionKind !== 'createEntity'));
const tableFields = computed(() => resolveEntityDisplayContract({
  entityType: props.entityType,
  surface: props.surface || 'table'
}).fields.slice(0, 6));

function formatCell(entity, path) {
  const value = String(path || '').split('.').filter(Boolean).reduce((item, key) => item?.[key], entity);
  if (value === undefined || value === null || value === '') return '';
  if (Array.isArray(value)) return value.length;
  if (typeof value === 'object') return value.name || value.label || value.uid || value._id || '';
  return String(value);
}
</script>
