<template>
  <div :class="LAYOUT.scrollX">
    <DataTable
    :value="instances"
    size="small"
    data-key="id"
    class="min-w-max"
    :paginator="instances.length > pagination.paginateAt"
    :rows="pagination.rows"
    :sort-field="activeSortField"
    :sort-order="activeSortOrder"
    removable-sort
    :pt="tablePt"
    :row-class="rowSurfaceClass"
    @sort-change="onSortChange"
  >
      <template #empty>
        <span class="text-supporting text-muted">{{ $t('uiMapping.emptyRegion') }}</span>
      </template>
    <Column sortable :sort-field="sortByIdentity" :header="$t('uiMapping.identityColumn')">
      <template #body="{ data }">
        <div class="flex min-w-0 items-center gap-2">
          <InstanceIdentity
            :instance="data"
            :type="type"
            :openable="openable"
            size="small"
            @open="target => $emit('open', target)"
          />
          <ParentRef v-if="parented" :instance="data" :bundle="bundle" :pool="pool" class="min-w-0 shrink-0" />
        </div>
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
          :quantitative="quantitative"
          :pool="pool"
          :bundle="bundle"
        />
      </template>
    </Column>
    <Column v-if="relationKey" :header="relationLabel">
      <template #body="{ data }">
        <div class="flex flex-wrap items-center gap-1">
          <InstanceInlineRef
            v-for="ref in budgetedRefs(data)"
            :key="ref.id"
            :type="String(ref?.type || '')"
            :id="ref?.id"
            :entity="pool?.[ref?.type]?.[ref?.id] || null"
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
import {
  LAYOUT, fieldLabel, tableColumnCount, ROW_RELATION_BUDGET, applyBudget,
  titleFor, resolveListControls, stateDisplayFor,
  localizedLabel, fieldLabelKey
, typeIsQuantitative } from '#shared/ui-mapping/index.js';
import { loadSortPreference, storeSortPreference } from '~/utils/ui-view-state.js';
import { useHostContainerTraits } from '~/composables/useContainerTraits.js';
import FieldControl from './FieldControl.vue';
import InstanceInlineRef from '../shared/InstanceInlineRef.vue';
import ParentRef from './ParentRef.vue';
import InstanceIdentity from './InstanceIdentity.vue';

const props = defineProps({
  instances: { type: Array, default: () => [] },
  type: { type: Object, default: null },
  // SPEC §22.8: the type's quantitative dominance earns the dashboard
  // field presentations.
  // Composed list-controls contract from the region tree; recomputed from
  // the type and loaded instances when absent (direct table usage).
  controls: { type: Object, default: null },
  // Identity cells render as links when an open handler exists upstream.
  openable: { type: Boolean, default: false },
  // The containment cross-cut composes on this collection (unscoped class
  // list): identity cells carry the parent context token.
  parented: { type: Boolean, default: false },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null },
  // Per-type state policy map: the status column exists exactly when the
  // compiled process authored a state vocabulary for the type.
  statePolicy: { type: Object, default: null }
});

const quantitative = computed(() => typeIsQuantitative(props.type));

defineEmits(['open']);

const { te, t } = useI18n();

// Notion-style row surfaces: every body row is a content-surface card
// (rounded, one step above the canvas) with a hairline gap between rows —
// the table box itself stays transparent. The header row recedes to a
// muted transparent caption band. All classes ride PrimeVue's official
// pt/rowClass channels with token-backed utilities; no scoped CSS.
// The row surface is the preset's content background; its corners are
// clipped here — a table row's own background is NOT clipped by its
// radius (measured: the corner pixels stayed white), while clip-path
// rounds them at the token radius.
const rowSurfaceClass = () => LAYOUT.rowSurface;
const tablePt = {
  root: { class: 'bg-transparent' },
  // The row-surface recipe's separation half: the table element carries
  // it through PrimeVue's pt channel (SPEC §22.10's sanctioned recipe
  // exception, like the rowClass clip).
  table: { class: LAYOUT.rowSurfaceTable },
  headerRow: { class: 'bg-transparent text-muted' },
  headerCell: { class: 'bg-transparent text-muted' }
};

const resolvedControls = computed(() => props.controls || resolveListControls(props.type, props.instances));
const pagination = computed(() => resolvedControls.value.pagination);
const startCase = value => String(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
const hasStatus = computed(() => Boolean(props.statePolicy));
const statusOf = instance => {
  const display = stateDisplayFor(props.statePolicy, instance?.state);
  return display ? { label: display.label, severity: display.severity } : null;
};
const sortByIdentity = item => titleFor(item, props.type, { unnamedLabel: t('common.unnamed') }).toLowerCase();
const sortByStatus = item => String(item?.state || '');
// Value-aware sortable columns: the filled short-scalar fields from the
// controls contract (fields no instance fills never become columns),
// bounded by the richness-scaled column budget. Quantity values sort by
// their numeric `value`. Filtering belongs to the region toolbar
// (the region header's search/facet toggles over the same contract), not the table.
// The host's width step sizes the column budget: a narrow or medium
// host (pane, popup) takes the compact scale — a surface sized for its
// container.
const hostContainer = useHostContainerTraits();
const compactHost = computed(() => hostContainer.value.width !== 'wide');
const scalarFields = computed(() => resolvedControls.value.sortKeys
  .slice(0, tableColumnCount(props.type, compactHost.value))
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
// persists per type (utils/ui-view-state.js) and survives remounts;
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

