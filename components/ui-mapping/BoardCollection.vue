<template>
  <div :class="LAYOUT.boardRow" data-testid="board-collection">
    <section
      v-for="column in columns"
      :key="column.value"
      :class="[LAYOUT.boardColumn, columnClasses(column)]"
      :aria-label="column.display.label"
      @dragover="onDragOver($event, column)"
      @dragleave="onDragLeave($event, column)"
      @drop="onDrop($event, column)"
    >
      <div :class="LAYOUT.rowBetween">
        <StateTag :value="column.value" :policy="statePolicy" />
        <div :class="LAYOUT.row">
          <Tag :value="String(column.instances.length)" severity="secondary" />
          <SortControl
            v-if="sortOptions.length"
            :options="sortOptions"
            :model-value="sortStateFor(column.value).name"
            :order="sortStateFor(column.value).order"
            @update:model-value="value => setColumnSort(column.value, { name: value })"
            @update:order="value => setColumnSort(column.value, { order: value })"
          />
        </div>
      </div>
      <div :class="LAYOUT.boardColumnScroll">
        <Card
          v-for="instance in column.instances"
          :key="instance.id"
          :class="[LAYOUT.clip, 'w-full cursor-grab active:cursor-grabbing']"
          draggable="true"
          data-testid="board-card"
          @dragstart="onDragStart($event, instance)"
          @dragend="onDragEnd"
        >
          <template #title>
            <div :class="LAYOUT.rowBetween">
              <div :class="LAYOUT.row">
                <i :class="iconFor(type, instance)" class="text-muted" />
                <Button
                  v-if="openable"
                  link
                  :label="identityOf(instance)"
                  class="text-left [&_.p-button-label]:truncate"
                  @click="$emit('open', instance)"
                />
                <span v-else class="truncate">{{ identityOf(instance) }}</span>
              </div>
              <Button
                v-if="actions.length"
                icon="pi pi-ellipsis-v"
                text
                rounded
                severity="secondary"
                :aria-label="$t('uiMapping.moreActions')"
                @click="event => openCardMenu(event, instance)"
              />
            </div>
          </template>
          <template #content>
            <div v-if="scalarFields.length" :class="LAYOUT.stackTight">
              <div v-for="field in scalarFields" :key="field.name" :class="LAYOUT.rowBetween">
                <span class="text-supporting text-muted">{{ field.label }}</span>
                <FieldControl
                  :model-value="instance.fields?.[field.name]"
                  :descriptor="field.descriptor"
                  variant="inline"
                  :pool="pool"
                  :bundle="bundle"
                />
              </div>
            </div>
          </template>
        </Card>
      </div>
    </section>
  </div>
  <Menu ref="cardMenu" :model="cardMenuItems" popup />
</template>

<script setup>
// The state board: the projection whose columns are the type's served
// state vocabulary and whose cards are the loaded instances grouped by
// their flat state. Column membership moves only through the authored
// machine — a card may drop into a column only when a contract edge
// (stateTransitionsByType over the producer workflows) leads there from
// its current state, and the drop dispatches through the same
// state-service transition channel the detail header's buttons use.
// While a drag is live every machine-legal target column carries the
// dashed target hairline and the hovered receiver steps up to the
// content surface, so legality is visible before the drop. Ordering
// belongs to the column: each lane sorts its own cards through the same
// sortKeys contract and shared comparator the region sort uses, with a
// per-type-and-state persisted preference. Column bodies are bounded
// and scroll independently, so the board fits its container instead of
// growing the page. Native HTML5 drag is the desktop affordance; the
// card's ellipsis menu and the opened record's transition strip remain
// the accessible and touch paths.
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Card from 'primevue/card';
import Tag from 'primevue/tag';
import Button from 'primevue/button';
import Menu from 'primevue/menu';
import {
  LAYOUT, SCALAR_BASES, cardFactCount, titleFor, iconFor,
  fieldLabel, fieldLabelKey, localizedLabel, sortControlRows,
  resolveActionButton, actionLabelKey, stateDisplayFor
} from '#shared/ui-mapping/index.js';
import { loadSortPreference, storeSortPreference } from '~/utils/ui-sort-preference.js';
import FieldControl from './FieldControl.vue';
import StateTag from './StateTag.vue';
import SortControl from './SortControl.vue';

const props = defineProps({
  instances: { type: Array, default: () => [] },
  type: { type: Object, default: null },
  // Composed list-controls contract from the region tree: the column
  // sort controls render over its sortKeys.
  controls: { type: Object, default: null },
  // Per-instance quick actions for the type (resolveInstanceActions):
  // deletion and instance-scoped commands re-emit through the region run
  // contract exactly like the card grid's ellipsis menu.
  actions: { type: Array, default: () => [] },
  // Collection identities render as links when an open handler exists.
  openable: { type: Boolean, default: false },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null },
  // Per-type state policy map from the compiled process contract: the
  // column vocabulary, in authored order.
  statePolicy: { type: Object, default: null },
  // Authored machine edges (stateTransitionsByType): the legal-move map.
  stateTransitions: { type: Array, default: null }
});

const emit = defineEmits(['open', 'run', 'transition']);

const { te, t } = useI18n();

const identityOf = instance => titleFor(instance, props.type, { unnamedLabel: t('common.unnamed') });
const scalarFields = computed(() => Object.entries(props.type?.fields || {})
  .filter(([, descriptor]) => SCALAR_BASES.includes(descriptor.base)
    && !(descriptor.base === 'string' && (descriptor.multiline === true || (descriptor.max || 0) >= 120)))
  .slice(0, cardFactCount(props.type))
  .map(([name, descriptor]) => ({
    name,
    descriptor,
    label: localizedLabel({ te, t }, fieldLabelKey(props.type?.id, name), fieldLabel(name, descriptor))
  })));

// Columns are the contract, not the data: the served vocabulary in
// authored order, then any stale state value present on loaded instances
// (a vocabulary that moved on degrades to its neutral display, one
// column per distinct value, and admits no drops — no edge leads there).
// Cards inside a column follow the column's own sort preference.
const columnSorts = reactive({});
const sortOptions = computed(() => (props.controls?.sortKeys || [])
  .map(key => ({ label: key.label, value: key.name })));
function sortStateFor(value) {
  if (!columnSorts[value]) {
    const saved = loadSortPreference(`board-column:${props.type?.id || ''}:${value}`);
    columnSorts[value] = { name: saved?.name || null, order: saved?.order || 1 };
  }
  return columnSorts[value];
}
function setColumnSort(value, patch) {
  const state = sortStateFor(value);
  Object.assign(state, patch);
  if (state.name) storeSortPreference(`board-column:${props.type?.id || ''}:${value}`, state);
}
const sortedInstancesOf = (value, instances) => {
  const state = columnSorts[value];
  const key = state?.name
    ? (props.controls?.sortKeys || []).find(entry => entry.name === state.name)
    : null;
  return key ? sortControlRows(instances, key, state.order) : instances;
};
const columns = computed(() => {
  const vocabulary = Object.keys(props.statePolicy || {});
  const known = new Set(vocabulary);
  const stale = [];
  for (const instance of props.instances) {
    const value = instance?.state;
    if (!value || known.has(value) || stale.includes(value)) continue;
    stale.push(value);
  }
  const byColumn = new Map([...vocabulary, ...stale].map(value => [value, []]));
  for (const instance of props.instances) {
    if (!byColumn.has(instance?.state)) continue;
    byColumn.get(instance.state).push(instance);
  }
  return [...vocabulary, ...stale].map(value => ({
    value,
    display: stateDisplayFor(props.statePolicy, value)
      || { label: value, severity: 'secondary', segments: [value] },
    instances: sortedInstancesOf(value, byColumn.get(value))
  }));
});

// One shared popup menu: the ellipsis remembers the card it opened for,
// and menu commands re-emit through the region run contract with that
// instance as context (confirmation and dispatch stay upstream).
const cardMenu = ref(null);
const menuInstance = ref(null);
function openCardMenu(event, instance) {
  menuInstance.value = instance;
  cardMenu.value?.toggle(event);
}
const cardMenuItems = computed(() => props.actions.map(action => {
  const resolved = resolveActionButton(action, { render: props.type?.render, statePolicy: props.statePolicy });
  return {
    label: localizedLabel({ te, t }, actionLabelKey(action.id), resolved.label || action.label || action.id),
    icon: resolved.icon || undefined,
    command: () => emit('run', action, { instance: menuInstance.value })
  };
}));

// Drag-and-drop: the dragged card's current state plus the contract
// edges decide which columns receive — every legal target carries the
// dashed hairline while the drag is live, the hovered receiver steps up
// to the content surface, and illegal lanes show no affordance at all.
// The drop is never optimistic — the machine executor owns the mutation
// and the pool reconciles through the shared entity event, so a refused
// or failed move leaves the card where the machine last put it.
const draggedInstance = ref(null);
const dropValue = ref('');
const edgeTo = (from, to) => (props.stateTransitions || [])
  .find(edge => edge.from === from && edge.to === to) || null;
const legalTargets = computed(() => {
  const from = draggedInstance.value?.state;
  if (!from) return new Set();
  return new Set((props.stateTransitions || []).filter(edge => edge.from === from).map(edge => edge.to));
});
function columnClasses(column) {
  if (!draggedInstance.value || !legalTargets.value.has(column.value)) return null;
  return dropValue.value === column.value ? LAYOUT.boardColumnReceiving : LAYOUT.boardColumnTarget;
}
function onDragStart(event, instance) {
  draggedInstance.value = instance;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', String(instance?.id || ''));
}
function onDragEnd() {
  draggedInstance.value = null;
  dropValue.value = '';
}
function onDragOver(event, column) {
  const instance = draggedInstance.value;
  if (!instance || !edgeTo(instance.state, column.value)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  dropValue.value = column.value;
}
// dragleave fires for every child boundary crossing; only clear when the
// pointer truly left the column.
function onDragLeave(event, column) {
  if (dropValue.value !== column.value) return;
  if (event.currentTarget?.contains(event.relatedTarget)) return;
  dropValue.value = '';
}
function onDrop(event, column) {
  event.preventDefault();
  const instance = draggedInstance.value;
  const edge = instance ? edgeTo(instance.state, column.value) : null;
  onDragEnd();
  if (!instance || !edge) return;
  emit('transition', {
    instance,
    to: edge.to,
    ...(edge.region ? { region: edge.region } : {}),
    ...(edge.intent ? { intent: edge.intent } : {})
  });
}
</script>
