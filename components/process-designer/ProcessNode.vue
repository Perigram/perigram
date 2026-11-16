<template>
  <!-- Cards are socket manifests, not inline editors: typed values and
       operation configuration live in the inspector; the canvas keeps
       identity, diagnostics, preview visibility, and named socket rows. -->
  <DesignerNodeCard :selected="selected" :faulted="faulted" size="lg" :primary="isOperation" :title="data.purpose || data.summary || ''">
    <div class="flex items-center gap-1.5">
      <Button
        :icon="collapsed ? 'pi pi-chevron-right' : 'pi pi-chevron-down'"
        text
        rounded
        size="small"
        severity="secondary"
        class="nodrag -ml-1.5 shrink-0"
        :title="collapsed ? $t('processDesigner.expandNode') : $t('processDesigner.collapseNode')"
        :aria-label="collapsed ? $t('processDesigner.expandNode') : $t('processDesigner.collapseNode')"
        @mousedown.stop
        @click.stop="toggleCollapsed"
      />
      <div v-tooltip.bottom="nodeSpecTooltip" class="min-w-0 flex-1">
        <div v-if="data.groupLabel" class="truncate text-supporting text-muted">{{ data.groupLabel }}</div>
        <strong class="block min-w-0 truncate text-label">{{ data.kindLabel || record.kind }}</strong>
      </div>
      <Button
        v-if="nodeSpecTooltip.value"
        icon="pi pi-info-circle"
        text
        rounded
        size="small"
        severity="secondary"
        class="nodrag shrink-0"
        :aria-label="$t('processDesigner.nodeDescription')"
        @mousedown.stop
        @click.stop
      />
      <Button
        v-if="faulted"
        icon="pi pi-exclamation-circle"
        text
        rounded
        size="small"
        severity="danger"
        class="nodrag shrink-0"
        :aria-label="$t('processDesigner.nodeErrors')"
        @mousedown.stop
        @click.stop="errorPopover?.toggle($event)"
      />
      <Popover ref="errorPopover" append-to="body">
        <div class="flex max-w-22rem flex-col gap-1 text-supporting text-status-danger">
          <span v-for="message in faultMessages" :key="message" class="overflow-wrap-anywhere">{{ message }}</span>
        </div>
      </Popover>
      <Button
        v-if="dataOutputs.length"
        :icon="previewVisible ? 'pi pi-eye' : 'pi pi-eye-slash'"
        :class="previewVisible ? 'text-muted' : 'text-status-info'"
        text
        rounded
        size="small"
        class="nodrag -mr-1.5 shrink-0"
        :title="previewVisible ? $t('processDesigner.previewNodeHide') : $t('processDesigner.previewNodeShow')"
        :aria-label="previewVisible ? $t('processDesigner.previewNodeHide') : $t('processDesigner.previewNodeShow')"
        @mousedown.stop
        @click.stop="togglePreviewVisible"
      />
    </div>

    <!-- Collapsed (§28 canvas rethinking): the card folds to its title
         with every socket at a distinct position — inputs on the top
         rail, outputs on the bottom rail, the name centered between. -->
    <div v-if="collapsed" class="mt-1 flex flex-col items-center gap-1 py-0.5">
      <div class="flex items-center gap-1.5">
        <DesignerSocketHandle
          v-for="input in collapseInputs"
          :key="`ci-${input.id}`"
          :socket="input"
          side="top"
          :title="socketTitle(input)"
        />
      </div>
      <div class="max-w-44 truncate text-label" :title="data.kindLabel || record.kind">{{ data.kindLabel || record.kind }}</div>
      <div class="flex items-center gap-1.5">
        <DesignerSocketHandle
          v-for="output in collapseOutputs"
          :key="`co-${output.id}`"
          :socket="output"
          side="bottom"
          :title="socketTitle(output)"
        />
      </div>
    </div>

    <div v-if="socketRows.length && !collapsed" class="-mx-2.5 mt-2 flex flex-col">
      <!-- One-sided rows render without their empty opposite cell; row
           labels ALWAYS render — quiet cards keep their sockets named
           (owner corrective 2026-09-28, node UI contract). -->
      <div v-for="row in socketRows" :key="row.key" class="flex min-h-7 items-center gap-x-5">
        <div v-if="row.input" :class="socketClass(row.input, 'left')" :title="socketTitle(row.input)">
          <DesignerSocketHandle :socket="row.input" side="left" :title="socketTitle(row.input)" />
          <span class="block truncate text-supporting">{{ row.input.label }}</span>
          <div v-if="showInlineFallback(row.input)" class="nodrag nowheel mt-0.5 w-full min-w-0" @mousedown.stop @click.stop>
            <TypedValueControl
              :base="row.input.base"
              :type-id="row.input.type?.typeId || ''"
              :model-value="inputDefault(row.input.id)"
              :status-options="data.processStatusOptions || []"
              :placeholder="inputPlaceholder(row.input)"
              @update:model-value="value => onFallbackValue(row.input, value)"
            />
          </div>
        </div>
        <div v-if="row.output" :class="socketClass(row.output, 'right')" :title="socketTitle(row.output)">
          <DesignerSocketHandle :socket="row.output" side="right" :title="socketTitle(row.output)" />
          <span class="block truncate text-supporting">{{ row.output.label }}</span>
        </div>
      </div>
    </div>

    <!-- The event section renders an effect's event sockets as ordinary
         socket rows (node UI contract): wired or manual reads from
         whether a wire is attached. -->
    <div v-if="eventSocketRows.length && !collapsed" class="-mx-2.5 mt-3">
      <div v-for="row in eventSocketRows" :key="row.key" class="flex min-h-7 items-center gap-x-5">
        <div v-if="row.input" :class="socketClass(row.input, 'left')" :title="socketTitle(row.input)">
          <DesignerSocketHandle :socket="row.input" side="left" :title="socketTitle(row.input)" />
          <span class="block truncate text-supporting">{{ row.input.label }}</span>
          <span class="truncate text-supporting text-muted">{{ row.input.typeLabel }}</span>
          <i :class="row.input.connected ? 'pi pi-link text-muted' : 'pi pi-unlink text-muted'" :title="row.input.connected ? t('processDesigner.socketConnected') : t('processDesigner.socketUnconnected')" aria-hidden="true" />
        </div>
        <div v-if="row.output" :class="socketClass(row.output, 'right')" :title="socketTitle(row.output)">
          <DesignerSocketHandle :socket="row.output" side="right" :title="socketTitle(row.output)" />
          <span class="block truncate text-supporting">{{ row.output.label }}</span>
          <span class="truncate text-supporting text-muted">{{ row.output.typeLabel }}</span>
          <i :class="row.output.connected ? 'pi pi-link text-muted' : 'pi pi-unlink text-muted'" :title="row.output.connected ? t('processDesigner.socketConnected') : t('processDesigner.socketUnconnected')" aria-hidden="true" />
        </div>
      </div>
    </div>
  </DesignerNodeCard>
</template>

<script setup>
import { operationKindOf } from '@perigram/cts';
import { isSecondaryPopulationKind } from '~/utils/processDesignerPopulation.js';

import { computed, ref } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Popover from 'primevue/popover';
import Select from '~/components/shared/InstanceSelect.vue';
import Textarea from 'primevue/textarea';
import { useI18n } from 'vue-i18n';
import {
  CAST_BASES,
  CONVERT_UNITS,
  EFFECT_SPECIES_KINDS,
  MAPPED_MUTATION_SPECIES_KINDS, formatProcessType } from '@perigram/processes';
import { socketSpecLine } from '~/composables/useNodeSpec.js';
import DesignerNodeCard from '~/components/shared/DesignerNodeCard.vue';
import DesignerSocketHandle from '~/components/shared/DesignerSocketHandle.vue';
import TypedValueControl from './TypedValueControl.vue';

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  selected: { type: Boolean, default: false }
});
const { t } = useI18n();

const record = computed(() => props.data.processNodeRecord || props.data);
const opKind = computed(() => operationKindOf(record.value || {}));
// Population primacy (node UI contract): operations are the primary
// nodes and render the primary-tinted surface — except the remove
// operation, which is presentation-secondary (the one predicate in
// utils/processDesignerPopulation.js).
// species is secondary surface.
const isOperation = computed(() => EFFECT_SPECIES_KINDS.has(opKind.value)
  && !isSecondaryPopulationKind(opKind.value));
const inputSpecs = computed(() => normalizeSpecs(record.value.inputs || props.data.inputSpecs || []));
const outputSpecs = computed(() => normalizeSpecs(record.value.outputs || props.data.outputSpecs || []));
const dataInputs = computed(() => inputSpecs.value.filter(input => input.role === 'data'));
const dataOutputs = computed(() => outputSpecs.value.filter(output => output.role === 'data'));
const eventInputs = computed(() => inputSpecs.value.filter(input => input.role !== 'data'));
const eventOutputs = computed(() => outputSpecs.value.filter(output => output.role !== 'data'));
const socketRows = computed(() => alignSockets(dataInputs.value, dataOutputs.value, 'data'));

// The header tooltip (quiet-card policy): what the node does + what its
// sockets expect and output — the node-spec summary the removed `?`
// affordance used to surface (SPEC §8/§20 vocabulary, presentation only).
const nodeSpecTooltip = computed(() => {
  const sections = [];
  if (dataInputs.value.length) {
    sections.push(`Expects: ${dataInputs.value.map(input => socketSpecLine(input, formatProcessType)).join(' • ')}`);
  }
  if (dataOutputs.value.length) {
    sections.push(`Outputs: ${dataOutputs.value.map(output => socketSpecLine(output, formatProcessType)).join(' • ')}`);
  }
  return { value: sections.join(' — ') };
});

// Node-scoped diagnostics (SPEC §28): the card carries its anchored
// messages — the fault border, the header glyph, and the leading message
// rows; the socket-spec tooltip stays available on an unfaulted card.
const faultMessages = computed(() => (Array.isArray(props.data.diagnostics) ? props.data.diagnostics : null));
const faulted = computed(() => Boolean(faultMessages.value?.length));
const errorPopover = ref(null);
const eventSocketRows = computed(() => alignSockets(eventInputs.value, eventOutputs.value, 'event'));
// The collapsed card's edge sockets: every socket, data and event alike.
const collapseInputs = computed(() => [...dataInputs.value, ...eventInputs.value]);
const collapseOutputs = computed(() => [...dataOutputs.value, ...eventOutputs.value]);
const collapsed = computed(() => Boolean(props.data.collapsed));

function toggleCollapsed() {
  props.data.collapsed = !collapsed.value;
}
const connectedInputs = computed(() => new Set(props.data.processConnectedInputIds || []));
const operationOptions = computed(() => props.data.processOperationOptions || []);
const showTypeEditor = computed(() => opKind.value.startsWith('source.literal'));
const baseTypeOptions = computed(() => [
  'string',
  'number',
  'integer',
  'boolean',
  'json',
  'date',
  'dateTime',
  'duration',
  'enum',
  'entityRef'
].map(value => ({ label: t(`processDesigner.dataTypes.${value}`), value })));
const castBaseOptions = CAST_BASES.map(value => ({ label: t(`processDesigner.dataTypes.${value}`), value }));
const convertUnitOptions = CONVERT_UNITS.map(value => ({ label: value, value }));
const isTypedValueUtility = computed(() => ['value.required', 'value.validate', 'value.coalesce', 'value.format'].includes(opKind.value));
const literalStructureDisplay = computed(() => (
  typeof record.value.value === 'string' ? record.value.value : JSON.stringify(record.value.value, null, 2)
));
const hasInlineConfiguration = computed(() => (
  showTypeEditor.value
  || operationOptions.value.length
  || opKind.value === 'value.cast'
  || isTypedValueUtility.value
  || opKind.value === 'value.convertUnit'
  || opKind.value.startsWith('source.literal')
));

// The one-line literal: a single data output (the value), no inputs —
// anything with more sockets keeps the full card.
const isOneLineLiteral = computed(() => (
  opKind.value === 'source.literalItem'
  && dataInputs.value.length === 0
  && dataOutputs.value.length === 1
  && eventSocketRows.value.length === 0
));
const oneLineOutput = computed(() => (isOneLineLiteral.value ? dataOutputs.value[0] : null));
function update(updates) {
  props.data.onProcessNodeUpdate?.(updates);
}

// Per-node preview visibility (SPEC §28): the header eye. An authored
// `previewVisible: false` removes the node's outputs from the preview
// channels; visible stays unauthored.
const previewVisible = computed(() => record.value.previewVisible !== false);

function togglePreviewVisible() {
  update({ previewVisible: previewVisible.value ? false : null });
}

const operationValue = computed(() => (
  opKind.value === 'collection.sort'
    ? record.value.direction || 'asc'
    : record.value.operation
));

function updateOperation(value) {
  update(opKind.value === 'collection.sort' ? { direction: value } : { operation: value });
}

function updateValueType(base) {
  const updates = { type: { ...(record.value.type || {}), base } };
  if (opKind.value.startsWith('source.literal')) {
    updates.value = base === 'boolean' ? false
      : ['number', 'integer'].includes(base) ? 0
        : base === 'json' ? {}
          : base === 'entityRef' ? null
            : '';
    if (base === 'entityRef') {
      updates.typeId = record.value.type?.typeId || record.value.typeId || '';
      updates.type.typeId = updates.typeId;
    }
  }
  update(updates);
}

function updateLiteralStructure(value) {
  try {
    update({ value: JSON.parse(value) });
  } catch {
    update({ value });
  }
}

function normalizeSpecs(items) {
  return items.map((item, index) => ({
    ...item,
    id: item.id || item.label || index,
    label: item.label || item.id || String(index),
    base: item.type?.base || 'json',
    type: item.type || {},
    role: item.role || 'data',
    connected: connectedInputs.value.has(item.id),
    typeLabel: formatProcessType(item.type)
  }));
}

function alignSockets(inputs, outputs, prefix) {
  return Array.from({ length: Math.max(inputs.length, outputs.length) }, (_, index) => ({
    key: `${prefix}-${inputs[index]?.id || ''}-${outputs[index]?.id || ''}-${index}`,
    input: inputs[index] || null,
    output: outputs[index] || null
  }));
}

function socketTitle(item) {
  return [item.label, item.typeLabel, item.description].filter(Boolean).join(' · ');
}

function showInlineFallback(input) {
  return props.selected
    && !input.connected
    && supportsInlineValue(input);
}

function supportsInlineValue(input) {
  // The Get Field path authors through the inspector pick or the field
  // wire — the socket takes a wire, not typed text.
  if (opKind.value === 'cts.field' && input.id === 'field') return false;
  return ['string', 'id', 'number', 'integer', 'boolean', 'json', 'date', 'dateTime', 'duration', 'enum', 'status', 'entityRef'].includes(input.base)
    && (input.access === 'item'
      // Mapped mutation sockets declare List consumption; an inline scalar
      // fallback is stored as one broadcast item.
      || (input.access === 'list' && MAPPED_MUTATION_SPECIES_KINDS.has(opKind.value)));
}

function inputDefault(id) {
  const value = record.value.inputDefaults?.[id];
  if (!value?.branches) return value;
  return value.branches[0]?.items?.[0];
}

// The fallback editor's value landing: typed values arrive parsed from
// TypedValueControl; an entityRef arrives as the authored reference
// { type, id } — the control owns the instance picking, and the socket's
// type is the typeId it was handed.
function onFallbackValue(input, value) {
  if (input.base === 'status') return updateStatusInputDefault(input.id, value);
  return updateInputDefault(input.id, value);
}

function inputPlaceholder(input) {
  if (input.base === 'status') return t('processDesigner.transitionStatusValue');
  return t('processDesigner.inlineValue');
}

function updateInputDefault(id, value) {
  const inputDefaults = { ...(record.value.inputDefaults || {}) };
  if (value == null || value === '') delete inputDefaults[id];
  else inputDefaults[id] = { branches: [{ path: [], items: [value] }] };
  update({ inputDefaults });
}

function updateStatusInputDefault(id, value) {
  // The target rides the record's `state` payload — the compile
  // vocabulary (`state.to`) the entry wire and the inspector write too;
  // the legacy `status` spelling only survives load-time renaming.
  update({
    inputDefaults: { ...(record.value.inputDefaults || {}), [id]: { branches: [{ path: [], items: [value] }] } },
    state: { ...(record.value.state || {}), to: value }
  });
}

function socketClass(item, side) {
  return [
    'relative min-w-0 max-w-44 py-1.5',
    side === 'left' ? 'pl-3' : 'ml-auto pr-3 text-right'
  ];
}

</script>
