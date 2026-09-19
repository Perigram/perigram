<template>
  <div :class="LAYOUT.scrollX">
    <DataTable
    :value="instances"
    size="small"
    data-key="id"
    :class="virtual ? '' : 'min-w-max'"
    :scrollable="virtual"
    :scroll-height="virtual ? '26rem' : undefined"
    :virtual-scroller-options="virtual ? { itemSize: 40 } : undefined"
    :paginator="!virtual && instances.length > pagination.paginateAt"
    :rows="pagination.rows"
    :sort-field="defaultSortField"
    :sort-order="1"
  >
      <template #empty>
        <span class="text-supporting text-muted">{{ $t('uiMapping.emptyRegion') }}</span>
      </template>
    <Column sortable :sort-field="sortByIdentity" :header="$t('uiMapping.identityColumn')">
      <template #body="{ data }">
        <span class="text-body block max-w-72 truncate">{{ identityOf(data) }}</span>
      </template>
    </Column>
    <Column v-if="hasStatus" sortable :sort-field="sortByStatus" :header="$t('uiMapping.statusColumn')">
      <template #body="{ data }">
        <Tag v-if="statusOf(data)" :value="statusOf(data).label" :severity="statusOf(data).severity" />
      </template>
    </Column>
    <Column
      v-for="field in scalarFields"
      :key="field.name"
      sortable
      :sort-field="field.sortField"
      :header="field.label"
    >
      <template #body="{ data }">
        <FieldControl
          :model-value="data.fields?.[field.name]"
          :descriptor="field.descriptor"
          variant="row"
          :pool="pool"
          :bundle="bundle"
        />
      </template>
    </Column>
    <Column v-if="relationKey" :header="relationLabel">
      <template #body="{ data }">
        <div class="flex flex-wrap items-center gap-1">
          <InstanceChip
            v-for="ref in budgetedRefs(data)"
            :key="ref.id"
            :value="ref"
            :pool="pool"
            :bundle="bundle"
          />
          <Tag v-if="hiddenRefCount(data) > 0" :value="`+${hiddenRefCount(data)}`" severity="contrast" />
        </div>
      </template>
    </Column>
    </DataTable>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Tag from 'primevue/tag';
import {
  LAYOUT, fieldLabel, tableColumnCount, ROW_RELATION_BUDGET, applyBudget,
  SEVERITY_MAP, instanceIdentity, resolveListControls,
  localizedLabel, fieldLabelKey
} from '#shared/ui-mapping/index.js';
import FieldControl from './FieldControl.vue';
import InstanceChip from './InstanceChip.vue';

const props = defineProps({
  instances: { type: Array, default: () => [] },
  type: { type: Object, default: null },
  // Composed list-controls contract from the region tree; recomputed from
  // the type and loaded instances when absent (direct table usage).
  controls: { type: Object, default: null },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null }
});

const { te, t } = useI18n();

const resolvedControls = computed(() => props.controls || resolveListControls(props.type, props.instances));
const pagination = computed(() => resolvedControls.value.pagination);
const virtual = computed(() => props.instances.length > pagination.value.virtualizeAt);
const startCase = value => String(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
const identityOf = instance => instanceIdentity(props.type, instance);
const hasStatus = computed(() => Boolean(props.type?.states?.main));
const statusOf = instance => {
  const value = instance.states?.main;
  if (!value) return null;
  const render = props.type.render?.states?.[value];
  return { label: render?.label || startCase(value), severity: SEVERITY_MAP[render?.severity] || 'secondary' };
};
const sortByIdentity = item => identityOf(item).toLowerCase();
const sortByStatus = item => String(item.states?.main || '');
// Value-aware columns: the filled short-scalar fields from the controls
// contract (fields no instance fills never become columns), bounded by
// the richness-scaled column budget. Quantity values sort by their
// numeric `value`.
const scalarFields = computed(() => resolvedControls.value.sortKeys
  .slice(0, tableColumnCount(props.type))
  .map(key => {
    const descriptor = props.type?.fields?.[key.name] || {};
    const label = localizedLabel({ te, t }, fieldLabelKey(props.type?.id, key.name), fieldLabel(key.name, descriptor));
    const sortField = descriptor.base === 'quantity'
      ? item => item.fields?.[key.name]?.value ?? null
      : item => item.fields?.[key.name] ?? null;
    return { name: key.name, descriptor, label, sortField };
  }));
const defaultSortField = computed(() => {
  const name = resolvedControls.value.defaultSort;
  if (!name) return undefined;
  const descriptor = props.type?.fields?.[name] || {};
  return descriptor.base === 'quantity'
    ? item => item.fields?.[name]?.value ?? null
    : item => item.fields?.[name] ?? null;
});
const relationKey = computed(() => Object.keys(props.type?.edges?.relations || {})[0] || null);
const relationLabel = computed(() => (relationKey.value ? startCase(relationKey.value) : ''));
const budgetedRefs = instance => {
  const refs = instance.relations?.[relationKey.value];
  const list = Array.isArray(refs) ? refs : refs ? [refs] : [];
  return applyBudget(list, ROW_RELATION_BUDGET).visible;
};
const hiddenRefCount = instance => {
  const refs = instance.relations?.[relationKey.value];
  const list = Array.isArray(refs) ? refs : refs ? [refs] : [];
  return applyBudget(list, ROW_RELATION_BUDGET).hidden;
};
</script>
