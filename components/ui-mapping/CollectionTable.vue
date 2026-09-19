<template>
  <div :class="LAYOUT.scrollX">
    <DataTable
    :value="instances"
    v-model:filters="filters"
    filter-display="row"
    :global-filter-fields="globalFilterFields"
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
      <template v-if="globalFilterFields.length" #header>
        <div :class="LAYOUT.row">
          <InputText
            v-model="filters['global'].value"
            :size="editorSize"
            :placeholder="$t('uiMapping.searchPlaceholder')"
            class="max-w-56"
            :aria-label="$t('uiMapping.searchPlaceholder')"
          />
        </div>
      </template>
      <template #empty>
        <span class="text-supporting text-muted">{{ $t('uiMapping.emptyRegion') }}</span>
      </template>
    <Column sortable :sort-field="sortByIdentity" :header="$t('uiMapping.identityColumn')">
      <template #body="{ data }">
        <span class="text-body block max-w-72 truncate">{{ identityOf(data) }}</span>
      </template>
    </Column>
    <Column
      v-if="hasStatus"
      sortable
      :sort-field="sortByStatus"
      field="states.main"
      filter-field="states.main"
      :filter-match-mode="statusMatchMode"
      :show-filter-menu="false"
      :show-clear-button="true"
      :header="$t('uiMapping.statusColumn')"
    >
      <template #body="{ data }">
        <Tag v-if="statusOf(data)" :value="statusOf(data).label" :severity="statusOf(data).severity" />
      </template>
      <template #filter="{ filterModel, filterCallback }">
        <AppSelect
          :model-value="filterModel.value"
          :options="statusOptions"
          option-label="label"
          option-value="value"
          :placeholder="$t('uiMapping.statusColumn')"
          show-clear
          :size="editorSize"
          class="w-full"
          @update:model-value="value => applyFilter(filterModel, filterCallback, value)"
        />
      </template>
    </Column>
    <Column
      v-for="field in scalarFields"
      :key="field.name"
      sortable
      :sort-field="field.sortField"
      :field="field.filterPath"
      :filter-field="field.filterPath"
      :filter-match-mode="field.matchMode"
      :data-type="field.numeric ? 'numeric' : 'text'"
      :show-filter-menu="false"
      :show-clear-button="true"
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
      <template v-if="field.filter === 'select'" #filter="{ filterModel, filterCallback }">
        <AppSelect
          :model-value="filterModel.value"
          :options="field.options"
          option-label="label"
          option-value="value"
          :placeholder="field.label"
          show-clear
          :size="editorSize"
          class="w-full"
          @update:model-value="value => applyFilter(filterModel, filterCallback, value)"
        />
      </template>
      <template v-else-if="field.filter === 'number'" #filter="{ filterModel, filterCallback }">
        <InputNumber
          v-model="filterModel.value"
          :size="editorSize"
          class="w-full"
          :placeholder="field.label"
          @update:model-value="filterCallback"
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
import { computed, inject, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { FilterMatchMode } from '@primevue/core/api';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Tag from 'primevue/tag';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import {
  LAYOUT, fieldLabel, tableColumnCount, ROW_RELATION_BUDGET, applyBudget,
  SEVERITY_MAP, instanceIdentity, resolveListControls,
  localizedLabel, fieldLabelKey
} from '#shared/ui-mapping/index.js';
import FieldControl from './FieldControl.vue';
import InstanceChip from './InstanceChip.vue';
import AppSelect from '~/components/shared/EntitySelect.vue';

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
const spacing = inject('uiMappingSpacing', null);
const editorSize = computed(() => (spacing ? spacing.editorSize : undefined));

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
const statusMatchMode = FilterMatchMode.EQUALS;
const statusOptions = computed(() => (props.type?.states?.main?.values || [])
  .map(value => ({ label: props.type.render?.states?.[value]?.label || startCase(value), value })));
const sortByIdentity = item => identityOf(item).toLowerCase();
const sortByStatus = item => String(item.states?.main || '');
// Value-aware columns: the filled short-scalar fields from the controls
// contract (fields no instance fills never become columns), bounded by
// the richness-scaled column budget. Quantity values sort and filter by
// their numeric `value`. Each column carries its native row filter:
// enums and booleans filter through selects over the values actually
// present, numbers and quantities through numeric input, the rest
// through the default text input; the global search covers the resolved
// search keys.
const scalarFields = computed(() => resolvedControls.value.sortKeys
  .slice(0, tableColumnCount(props.type))
  .map(key => {
    const descriptor = props.type?.fields?.[key.name] || {};
    const label = localizedLabel({ te, t }, fieldLabelKey(props.type?.id, key.name), fieldLabel(key.name, descriptor));
    const numeric = descriptor.base === 'number' || descriptor.base === 'quantity';
    const filterPath = descriptor.base === 'quantity' ? `fields.${key.name}.value` : `fields.${key.name}`;
    const sortField = descriptor.base === 'quantity'
      ? item => item.fields?.[key.name]?.value ?? null
      : item => item.fields?.[key.name] ?? null;
    const facet = resolvedControls.value.facets.find(entry => entry.name === key.name);
    const options = descriptor.base === 'enum'
      ? (facet?.values?.length ? facet.values : descriptor.values || []).map(value => ({ label: startCase(value), value }))
      : descriptor.base === 'boolean'
        ? [{ label: t('common.yes'), value: true }, { label: t('common.no'), value: false }]
        : [];
    return {
      name: key.name,
      descriptor,
      label,
      numeric,
      filterPath,
      sortField,
      filter: options.length ? 'select' : numeric ? 'number' : 'text',
      options,
      matchMode: options.length || numeric ? FilterMatchMode.EQUALS : FilterMatchMode.CONTAINS
    };
  }));
const filters = ref(initFilters());
function initFilters() {
  const meta = { global: { value: null, matchMode: FilterMatchMode.CONTAINS } };
  if (hasStatus.value) meta['states.main'] = { value: null, matchMode: FilterMatchMode.EQUALS };
  for (const field of scalarFields.value) {
    meta[field.filterPath] = { value: null, matchMode: field.matchMode };
  }
  return meta;
}
watch(() => props.type?.id, () => { filters.value = initFilters(); });
// Pool reloads recompute the controls contract: sync filter keys while
// keeping the values the user already entered.
watch(resolvedControls, () => {
  const next = initFilters();
  for (const [key, meta] of Object.entries(filters.value)) {
    if (next[key]) next[key].value = meta.value;
  }
  filters.value = next;
});
const globalFilterFields = computed(() => (resolvedControls.value.searchKeys || []).map(key => `fields.${key}`));
function applyFilter(filterModel, filterCallback, value) {
  filterModel.value = value;
  filterCallback();
}
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
