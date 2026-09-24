<template>
  <div :class="[LAYOUT.scrollX, 'ck-collection-rows']">
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
    :sort-field="activeSortField"
    :sort-order="activeSortOrder"
    removable-sort
    :pt="tablePt"
    @sort-change="onSortChange"
  >
      <template #empty>
        <span class="text-supporting text-muted">{{ $t('uiMapping.emptyRegion') }}</span>
      </template>
    <Column sortable :sort-field="sortByIdentity" :header="$t('uiMapping.identityColumn')">
      <template #body="{ data }">
        <Button
          v-if="openable"
          link
          size="small"
          :label="identityOf(data)"
          class="max-w-72 text-left [&_.p-button-label]:truncate"
          @click="$emit('open', data)"
        />
        <span v-else class="text-body block max-w-72 truncate">{{ identityOf(data) }}</span>
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
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Tag from 'primevue/tag';
import Button from 'primevue/button';
import {
  LAYOUT, fieldLabel, tableColumnCount, ROW_RELATION_BUDGET, applyBudget,
  SEVERITY_MAP, titleFor, resolveListControls,
  localizedLabel, fieldLabelKey
} from '#shared/ui-mapping/index.js';
import { loadSortPreference, storeSortPreference } from '~/utils/ui-sort-preference.js';
import FieldControl from './FieldControl.vue';
import InstanceChip from './InstanceChip.vue';

const props = defineProps({
  instances: { type: Array, default: () => [] },
  type: { type: Object, default: null },
  // Composed list-controls contract from the region tree; recomputed from
  // the type and loaded instances when absent (direct table usage).
  controls: { type: Object, default: null },
  // Identity cells render as links when an open handler exists upstream.
  openable: { type: Boolean, default: false },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null }
});

defineEmits(['open']);

const { te, t } = useI18n();

// Notion-style row surfaces: every body row is a content-surface card
// (rounded, one step above the canvas) with a hairline gap between rows —
// the table box itself stays transparent. The header row recedes to a
// muted transparent caption band. All classes ride PrimeVue's official
// pt/rowClass channels with token-backed utilities; no scoped CSS.
const tablePt = {
  root: { class: 'bg-transparent' },
  headerRow: { class: 'bg-transparent text-muted' },
  headerCell: { class: 'bg-transparent text-muted' },
  // The surface lives on the cells (the preset paints bodyCell); rounding
  // the edge cells is what makes the row card's corners — a row's own
  // background is not clipped by its radius.
  bodyCell: { class: 'first:rounded-l-ui last:rounded-r-ui' }
};

const resolvedControls = computed(() => props.controls || resolveListControls(props.type, props.instances));
const pagination = computed(() => resolvedControls.value.pagination);
const virtual = computed(() => props.instances.length > pagination.value.virtualizeAt);
const startCase = value => String(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
const identityOf = instance => titleFor(instance, props.type, { unnamedLabel: t('common.unnamed') });
const hasStatus = computed(() => Boolean(props.type?.states?.main));
const statusOf = instance => {
  const value = instance.states?.main;
  if (!value) return null;
  const render = props.type.states?.main?.render?.[value];
  return { label: render?.label || startCase(value), severity: SEVERITY_MAP[render?.severity] || 'secondary' };
};
const sortByIdentity = item => identityOf(item).toLowerCase();
const sortByStatus = item => String(item.states?.main || '');
// Value-aware sortable columns: the filled short-scalar fields from the
// controls contract (fields no instance fills never become columns),
// bounded by the richness-scaled column budget. Quantity values sort by
// their numeric `value`. Filtering belongs to the region toolbar
// (the region header's search/facet toggles over the same contract), not the table.
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
// Sort selection is controlled and named: each sortable column maps to a
// stable name (identity / status / field name) so the user's choice
// persists per type (utils/ui-sort-preference.js) and survives remounts;
// without a preference the declared default sort applies.
const sortFieldByName = name => {
  if (name === 'identity') return sortByIdentity;
  if (name === 'status') return sortByStatus;
  const descriptor = props.type?.fields?.[name] || {};
  return descriptor.base === 'quantity'
    ? item => item.fields?.[name]?.value ?? null
    : item => item.fields?.[name] ?? null;
};
const nameForSortField = field => {
  if (field === sortByIdentity) return 'identity';
  if (field === sortByStatus) return 'status';
  const entry = scalarFields.value.find(candidate => candidate.sortField === field);
  return entry?.name || '';
};
const defaultSortField = computed(() => {
  const name = resolvedControls.value.defaultSort;
  return name ? sortFieldByName(name) : undefined;
});
const sortScope = computed(() => `collection-table:${props.type?.id || ''}`);
const preferredSort = loadSortPreference(sortScope.value);
const activeSortField = ref(preferredSort?.name ? sortFieldByName(preferredSort.name) : defaultSortField.value);
const activeSortOrder = ref(preferredSort?.order || 1);
watch(defaultSortField, value => {
  if (!activeSortField.value) activeSortField.value = value;
});
function onSortChange({ sortField, sortOrder }) {
  activeSortField.value = sortField;
  activeSortOrder.value = sortOrder || 1;
  const name = nameForSortField(sortField);
  if (name) storeSortPreference(sortScope.value, { name, order: activeSortOrder.value });
}
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

<style scoped>
/* Row-surface rhythm (layout-only declarations): separated cell borders
   leave a hairline gap between the rounded content rows, so each row
   reads as its own surface card over the transparent table box. */
.ck-collection-rows :deep(.p-datatable-table) {
  border-collapse: separate;
  border-spacing: 0 0.25rem;
}
</style>
