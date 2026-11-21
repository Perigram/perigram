<template>
  <div ref="rowEl" :class="LAYOUT.boardRow" data-testid="board-collection" @dragover="onRowDragOver">
    <section
      v-for="column in columns"
      :key="column.value"
      :class="columnClasses(column)"
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
          :class="[LAYOUT.clip, 'w-full shrink-0', movable(instance) ? 'cursor-grab active:cursor-grabbing' : null]"
          :draggable="movable(instance)"
          data-testid="board-card"
          @dragstart="onDragStart($event, instance)"
          @dragend="onDragEnd"
        >
          <template #header>
            <PreviewBox :type="type" :instance="instance" :payload="instance.payload" :preview-source="instance.previewSource" />
          </template>
          <template #title>
            <div :class="LAYOUT.rowBetween">
              <InstanceIdentity
                :instance="instance"
                :type="type"
                :openable="openable"
                @open="target => $emit('open', target)"
              />
              <Button
                v-if="cardActionsFor(instance).length"
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
            <div v-if="scalarFields.length" :class="spacing ? spacing.stackTight : LAYOUT.stackTight">
              <div v-for="field in visibleFieldsFor(instance)" :key="field.name" :class="LAYOUT.rowBetween">
                <span class="text-supporting text-muted">{{ field.label }}</span>
                <FieldControl
                  :model-value="instance.fields?.[field.name]"
                  :descriptor="field.descriptor"
                  variant="inline"
                  :quantitative="quantitative"
                  :pool="pool"
                  :bundle="bundle"
                />
              </div>
              <!-- The overflow opens the card's record popup — the record
                   surface carries the full fact set. -->
              <Button
                v-if="hiddenFieldCount(instance)"
                :label="$t('uiMapping.showMore', { count: hiddenFieldCount(instance) })"
                link
                size="small"
                severity="secondary"
                @click="openRecord(instance)"
              />
            </div>
          </template>
        </Card>
      </div>
    </section>
  </div>
  <Menu ref="cardMenu" :model="cardMenuItems" popup />
</template>

<script setup>
// Column membership moves only through the machine; the served resolver overrides the compiled contract copy.
import { computed, inject, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Card from 'primevue/card';
import Tag from 'primevue/tag';
import Button from 'primevue/button';
import Menu from 'primevue/menu';
import {
  LAYOUT, SCALAR_BASES, cardFactCount,
  fieldLabel, fieldLabelKey, localizedLabel, sortControlRows,
  resolveActionButton, actionLabelKey, stateDisplayFor
, typeIsQuantitative } from '#shared/ui-mapping/index.js';
import { loadSortPreference, storeSortPreference } from '~/utils/ui-view-state.js';
import { actionAppliesToEntity } from '~/utils/action-visibility.js';
import { useEntityPopup } from '~/composables/useEntityPopup';
import FieldControl from './FieldControl.vue';
import PreviewBox from './PreviewBox.vue';
import StateTag from './StateTag.vue';
import SortControl from './SortControl.vue';
import InstanceIdentity from './InstanceIdentity.vue';
import { useHostContainerTraits } from '~/composables/useContainerTraits.js';

const props = defineProps({
  instances: { type: Array, default: () => [] },
  type: { type: Object, default: null },
  // SPEC §22.8: the type's quantitative dominance earns the dashboard
  // field presentations.
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
  // Authored machine edges (stateTransitionsByType): the instant
  // legal-move map from the compiled contract copy.
  stateTransitions: { type: Array, default: null },
  // The machine-authority resolver (the state service's per-instance
  // transitions — the same source the detail header's buttons dispatch
  // through): fetched for the dragged card at dragstart. The compiled
  // contract copy can lag the served machine (vocabulary seeded without
  // wired action records still serves transitions through overrides or
  // default machines), so the served answer replaces the contract one
  // the moment it arrives. Null in hosts without a state service (the
  // showcase) — there the contract edges are the whole truth.
  resolveTransitions: { type: Function, default: null }
});

const quantitative = computed(() => typeIsQuantitative(props.type));

const emit = defineEmits(['open', 'run', 'transition']);

const { te, t } = useI18n();
// The screen's spacing coefficient (density): the facts rhythm follows
// the same injected scale every other projection consumes, so compact
// screens and the showcase slider shrink board cards with everything
// else.
const spacing = inject('uiMappingSpacing', null);
const hostContainer = useHostContainerTraits();

// Facts follow the card-grid budget (cardFactCount over CARD_FACT_SCALE:
// wide types earn more facts); beyond-budget facts collapse behind the
// show-more control, which opens the record popup.
const factBudget = computed(() => cardFactCount(props.type, { compact: hostContainer.value.width === 'narrow' }));
const visibleFieldsFor = () => scalarFields.value.slice(0, factBudget.value);
const hiddenFieldCount = () => Math.max(0, scalarFields.value.length - factBudget.value);
// The popup is the record surface; the screen's open channel is the
// fallback.
const { open: openEntityPopup, openable: popupOpenable } = useEntityPopup();
function openRecord(instance) {
  const typeId = String(props.type?.id || '');
  if (typeId && popupOpenable(typeId)) {
    openEntityPopup({ typeId, instanceId: String(instance.id) });
    return;
  }
  emit('open', instance);
}
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

// One shared popup menu: the ellipsis renders on a card only when that
// card carries an applicable action, and menu commands re-emit through
// the region run contract with that instance as context (confirmation
// and dispatch stay upstream).
const cardMenu = ref(null);
const menuInstance = ref(null);
function openCardMenu(event, instance) {
  menuInstance.value = instance;
  cardMenu.value?.toggle(event);
}
const cardActionsFor = instance => props.actions
  .filter(action => actionAppliesToEntity(action, instance, props.type?.id))
  .filter(action => !resolveActionButton(action, { render: props.type?.render, statePolicy: props.statePolicy }).hidden);
const cardMenuItems = computed(() => cardActionsFor(menuInstance.value || {})
  .map(action => {
  const resolved = resolveActionButton(action, { render: props.type?.render, statePolicy: props.statePolicy });
  return {
    label: localizedLabel({ te, t }, actionLabelKey(action.id), resolved.label || action.label || action.id),
    icon: resolved.icon || undefined,
    command: () => emit('run', action, { instance: menuInstance.value })
  };
}));

// The drop emits the transition intent; pool mutation belongs to the host's optimistic executors.
const draggedInstance = ref(null);
const dropValue = ref('');
const rowEl = ref(null);
const contractEdges = computed(() => props.stateTransitions || []);
const servedTransitions = ref(null);
const activeTransitions = computed(() => servedTransitions.value || contractEdges.value);
const edgeTo = (from, to) => activeTransitions.value
  .find(edge => edge.from === from && edge.to === to) || null;
const movable = instance => (props.resolveTransitions ? true : contractEdges.value
  .some(edge => edge.from === instance?.state));
const legalTargets = computed(() => {
  const from = draggedInstance.value?.state;
  if (!from) return new Set();
  return new Set(activeTransitions.value.filter(edge => edge.from === from).map(edge => edge.to));
});
function columnClasses(column) {
  if (!draggedInstance.value || !legalTargets.value.has(column.value)) return LAYOUT.boardColumn;
  return LAYOUT.boardColumnTarget;
}
function onDragStart(event, instance) {
  draggedInstance.value = instance;
  servedTransitions.value = null;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('application/x-perigram-instance', String(instance?.id || ''));
  if (props.resolveTransitions) {
    Promise.resolve(props.resolveTransitions(instance))
      .then(actions => {
        if (draggedInstance.value !== instance) return;
        servedTransitions.value = (Array.isArray(actions) ? actions : [])
          .filter(action => action?.to)
          .map(action => ({
            from: instance.state,
            to: action.to,
            region: action.region || null,
            intent: action.intent || null
          }));
      })
      .catch(() => {});
  }
}
function onDragEnd() {
  draggedInstance.value = null;
  dropValue.value = '';
  servedTransitions.value = null;
  edgeZone.value = 0;
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

// Horizontal rail auto-scroll: a drag hovering the rail's edge zone
// scrolls the board toward the hidden columns. The zone is tracked from
// the row's dragover (which keeps firing while the pointer rests), and a
// timer performs the scroll so a stationary pointer still travels.
const EDGE_ZONE_PX = 56;
const EDGE_STEP_PX = 18;
const EDGE_TICK_MS = 80;
const edgeZone = ref(0);
let edgeTimer = null;
function onRowDragOver(event) {
  if (!draggedInstance.value) return;
  const el = rowEl.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const x = event.clientX - rect.left;
  edgeZone.value = x < EDGE_ZONE_PX ? -1 : x > rect.width - EDGE_ZONE_PX ? 1 : 0;
}
watch(edgeZone, zone => {
  if (edgeTimer) { clearInterval(edgeTimer); edgeTimer = null; }
  if (!zone) return;
  edgeTimer = setInterval(() => {
    const el = rowEl.value;
    if (!el || !draggedInstance.value) {
      edgeZone.value = 0;
      return;
    }
    el.scrollLeft += zone * EDGE_STEP_PX;
  }, EDGE_TICK_MS);
});
onBeforeUnmount(() => {
  if (edgeTimer) clearInterval(edgeTimer);
});
</script>
