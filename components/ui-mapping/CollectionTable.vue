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
    <Column sortable :sort-field="sortByIdentity" :header="identityColumnLabel">
      <template #body="{ data }">
        <InstanceIdentity
          :instance="data"
          :type="type"
          :openable="openable"
          size="small"
          @open="target => $emit('open', target)"
        />
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
        <InlineField
          :field="{ name: field.name, descriptor: field.descriptor, value: data.fields?.[field.name] }"
          :editable="patchable"
          cell
          :quantitative="quantitative"
          :pool="pool"
          :bundle="bundle"
          @inline-change="change => $emit('inline-change', { instance: data, change: { [change.name]: change.value } })"
        />
      </template>
    </Column>
    <Column v-if="relationKey" :header="relationLabel">
      <template #body="{ data }">
        <div class="flex flex-wrap items-center gap-1">
          <InstanceInlineRef
            v-for="ref in budgetedRefs(data)"
            :key="ref.id"
            :type="String(ref?.typeId || '')"
            :id="ref?.id"
            :entity="pool?.[ref?.typeId]?.[ref?.id] || ref?.entity || null"
          />
          <!-- The overflow opens the row's record popup — the record
               surface carries the full relation set. -->
          <Button
            v-if="hiddenRefCount(data) > 0"
            :label="$t('uiMapping.showMore', { count: hiddenRefCount(data) })"
            link
            size="small"
            severity="secondary"
            @click.stop="openRowRecord(data)"
          />
        </div>
      </template>
    </Column>
    <Column v-if="summaryField" :header="summaryField.label">
      <template #body="{ data }">
        <FieldControl
          :model-value="data.fields?.[summaryField.name]"
          :descriptor="summaryField.descriptor"
          variant="inline"
          :quantitative="quantitative"
          :pool="pool"
          :bundle="bundle"
        />
      </template>
    </Column>
    <Column
      v-for="edge in childrenEdges"
      :key="`children:${edge.key}`"
      :header="edge.label"
    >
      <template #body="{ data }">
        <div class="flex flex-wrap items-center gap-1">
          <InstanceInlineRef
            v-for="child in budgetedChildren(data, edge.key)"
            :key="`${child.type}:${child.id}`"
            :type="child.type"
            :id="child.id"
            :entity="child"
          />
          <!-- The overflow opens the row's record popup — the record
               surface carries every child collection in full. -->
          <Button
            v-if="hiddenChildCount(data, edge.key) > 0"
            :label="$t('uiMapping.showMore', { count: hiddenChildCount(data, edge.key) })"
            link
            size="small"
            severity="secondary"
            @click.stop="openRowRecord(data)"
          />
        </div>
      </template>
    </Column>
    <Column v-if="actions.length || relationUnlink" class="w-10">
      <template #body="{ data }">
        <Button
          v-if="rowActionsFor(data).length || unlinkItemsFor(data).length"
          icon="pi pi-ellipsis-v"
          text
          rounded
          severity="secondary"
          size="small"
          :aria-label="$t('uiMapping.moreActions')"
          @click.stop="event => openRowMenu(event, data)"
        />
      </template>
    </Column>
    </DataTable>
  </div>
  <Menu ref="rowMenu" :model="rowMenuItems" popup />
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Tag from 'primevue/tag';
import Button from 'primevue/button';
import Menu from 'primevue/menu';
import {
  LAYOUT, fieldLabel, tableColumnCount, ROW_RELATION_BUDGET, applyBudget,
  titleFor, resolveListControls, stateDisplayFor, childrenOfParent,
  resolveActionButton, actionLabelKey, localizedLabel, fieldLabelKey,
  typeIsQuantitative, typeLabelKey
} from '#shared/ui-mapping/index.js';
import { actionAppliesToEntity } from '~/utils/action-visibility.js';
import { generatedActionLabel, generatedEntityLabel } from '~/utils/generated-labels.js';
import { loadSortPreference, storeSortPreference } from '~/utils/ui-view-state.js';
import { resolveInstanceRelationRefs } from '~/utils/instance-relations.js';
import { useHostContainerTraits } from '~/composables/useContainerTraits.js';
import { useEntityPopup } from '~/composables/useEntityPopup';
import InstanceInlineRef from '../shared/InstanceInlineRef.vue';
import InstanceIdentity from './InstanceIdentity.vue';
import InlineField from './InlineField.vue';
import FieldControl from './FieldControl.vue';

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
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null },
  // Per-type state policy map: the status column exists exactly when the
  // compiled process authored a state vocabulary for the type.
  statePolicy: { type: Object, default: null },
  // Per-instance quick actions (resolveInstanceActions): one ellipsis
  // menu per row, the same run contract the cards carry.
  actions: { type: Array, default: () => [] },
  // SPEC §22.12: `{ parent, actions }` — the section's unlink actions
  // bound to the parent record (relation-scoped sections only).
  relationUnlink: { type: Object, default: null },
  // Cell values edit in place (the per-field pencil law) when the host
  // binds a patch executor.
  patchable: { type: Boolean, default: false }
});

const quantitative = computed(() => typeIsQuantitative(props.type));

const emit = defineEmits(['open', 'run', 'inline-change']);

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

const resolvedControls = computed(() => props.controls
  || resolveListControls(props.type, props.instances, { pool: props.pool }));
const pagination = computed(() => resolvedControls.value.pagination);
const startCase = value => String(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
const hasStatus = computed(() => Boolean(props.statePolicy));
const statusOf = instance => {
  const display = stateDisplayFor(props.statePolicy, instance?.state);
  return display ? { label: display.label, severity: display.severity } : null;
};
const sortByIdentity = item => titleFor(item, props.type, { unnamedLabel: t('common.unnamed') }).toLowerCase();
// SPEC §22.15: the identity column header names the type's identifier
// field; a type that declares none falls back to the type label.
const identityColumnLabel = computed(() => {
  const identifierName = props.type?.identifier || null;
  const descriptor = identifierName ? props.type?.fields?.[identifierName] : null;
  if (identifierName && descriptor) {
    return localizedLabel({ te, t }, fieldLabelKey(props.type.id, identifierName), fieldLabel(identifierName, descriptor));
  }
  return localizedLabel(
    { te, t },
    typeLabelKey(props.type?.id),
    props.type ? generatedEntityLabel(props.type, { t, te }) : ''
  );
});
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
// The relation chip column rides the contract: the first declared
// relation (an explicit edge or a declared ref field), a column only
// when any loaded instance carries its refs.
const relationKey = computed(() => resolvedControls.value.relationColumn?.key || null);
const relationLabel = computed(() => {
  if (!relationKey.value) return '';
  const descriptor = props.type?.fields?.[relationKey.value];
  if (descriptor) {
    return localizedLabel({ te, t }, fieldLabelKey(props.type?.id, relationKey.value), fieldLabel(relationKey.value, descriptor));
  }
  return startCase(relationKey.value);
});
// Relation refs normalize through the one app resolver: stored shapes
// without a type adopt the relation's single declared target — the
// edge's type list or the ref field's first accepted type.
const relationTargetType = computed(() => {
  const edgeTypes = props.type?.edges?.relations?.[relationKey.value]?.types || [];
  if (edgeTypes.length === 1) return edgeTypes[0];
  const field = props.type?.fields?.[relationKey.value];
  const accepts = field?.accepts || field?.itemType?.accepts || [];
  return accepts.length === 1 ? accepts[0] : null;
});
const relationRefsOf = instance => resolveInstanceRelationRefs(
  instance?.relations?.[relationKey.value],
  { typeId: relationTargetType.value }
);
const budgetedRefs = instance => applyBudget(relationRefsOf(instance), ROW_RELATION_BUDGET).visible;
const hiddenRefCount = instance => applyBudget(relationRefsOf(instance), ROW_RELATION_BUDGET).hidden;

// The structural summary column: the contract's first filled
// json/record/map field renders its bounded inline summary (SPEC §22.8)
// beside the scalar columns; a narrow host sheds it with the rest.
const summaryField = computed(() => {
  const key = resolvedControls.value.summaryColumn?.key;
  if (!key || compactHost.value) return null;
  const descriptor = props.type?.fields?.[key] || null;
  if (!descriptor) return null;
  return {
    name: key,
    descriptor,
    label: localizedLabel({ te, t }, fieldLabelKey(props.type?.id, key), fieldLabel(key, descriptor))
  };
});

// The children columns: one per declared children edge, its key labels
// the column, and only that edge's instances whose lineage points at
// the row render as chips under the row's own budget
// (`childrenOfParent`, the one containment matcher). Presence derives
// live per edge over the pool (the host overlays child types lazily),
// so the compose-frozen controls never gate it.
const childrenOf = (instance, edgeKey) => childrenOfParent(props.type, props.pool, instance?.id, { edgeKey });
const edgeHasChildren = edgeKey => props.instances.some(instance => childrenOf(instance, edgeKey).length > 0);
const childrenEdges = computed(() => Object.entries(props.type?.edges?.children || {})
  .filter(([edgeKey]) => edgeHasChildren(edgeKey))
  .map(([edgeKey, declaration]) => ({
    key: edgeKey,
    types: declaration?.types || [],
    label: localizedLabel({ te, t }, fieldLabelKey(props.type?.id, edgeKey), startCase(edgeKey))
  })));
const budgetedChildren = (instance, edgeKey) => applyBudget(childrenOf(instance, edgeKey), ROW_RELATION_BUDGET).visible;
const hiddenChildCount = (instance, edgeKey) => applyBudget(childrenOf(instance, edgeKey), ROW_RELATION_BUDGET).hidden;
// The chip-cell overflows open the row's record popup — the record
// surface carries the full relation and child sets (the round-18
// overflow law); the screen's open channel is the fallback.
const { open: openEntityPopup, openable: popupOpenable } = useEntityPopup();
function openRowRecord(instance) {
  const typeId = String(props.type?.id || '');
  if (typeId && popupOpenable(typeId)) {
    openEntityPopup({ typeId, instanceId: String(instance.id) });
    return;
  }
  emit('open', instance);
}

// One shared row-action menu (the card-grid pattern): the ellipsis
// renders on a row only when that row carries an applicable action, and
// commands re-emit through the region run contract with the instance as
// context.
const rowMenu = ref(null);
const menuInstance = ref(null);
function openRowMenu(event, instance) {
  menuInstance.value = instance;
  rowMenu.value?.toggle(event);
}
const rowActionsFor = instance => props.actions
  .filter(action => actionAppliesToEntity(action, instance, props.type?.id))
  .filter(action => !resolveActionButton(action, { render: props.type?.render, statePolicy: props.statePolicy }).hidden);
// SPEC §22.12: a relation-scoped section's linked rows carry the parent's
// unlink actions — the run context binds the parent record and the row's
// relation ref as the mutation payload.
const unlinkItemsFor = instance => (props.relationUnlink?.actions || [])
  .map(action => {
    const key = action.relationMutation?.key || action.relation?.key || '';
    const rowId = String(instance?._id || instance?.id || '');
    if (!key || !rowId) return null;
    return {
      label: generatedActionLabel(action, action.id, { t, te }),
      icon: 'pi pi-times',
      command: () => emit('run', action, {
        instance: props.relationUnlink.parent,
        data: { relations: { [key]: { type: props.type?.id, id: rowId } } }
      })
    };
  })
  .filter(Boolean);
const rowMenuItems = computed(() => [
  ...rowActionsFor(menuInstance.value || {})
    .map(action => {
      const resolved = resolveActionButton(action, { render: props.type?.render, statePolicy: props.statePolicy });
      return {
        label: localizedLabel({ te, t }, actionLabelKey(action.id), resolved.label || action.label || action.id),
        icon: resolved.icon || undefined,
        command: () => emit('run', action, { instance: menuInstance.value })
      };
    }),
  ...unlinkItemsFor(menuInstance.value || {})
]);
</script>
