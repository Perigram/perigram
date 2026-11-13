<template>
  <!-- One-line literal (SPEC "Node layouts"): no header, no named socket
       rows — type dropdown + value, with the value socket's unnamed
       handle docked at the row's right edge. -->
  <DesignerNodeCard v-if="isOneLineLiteral" :selected="selected" :faulted="faulted" size="inline" :primary="isOperation" :title="data.purpose || data.summary || ''">
    <div class="nodrag nowheel flex items-center gap-1.5" @mousedown.stop @click.stop>
      <Select
        v-if="record.type?.base === 'entityRef'"
        :model-value="record.typeId || record.type.typeId"
        :options="data.processTypeIdOptions || []"
        option-label="label"
        option-value="value"
        size="small"
        class="min-w-0 flex-1"
        @update:model-value="value => update({ typeId: value, type: { ...record.type, typeId: value } })"
      />
      <Select
        v-else
        :model-value="record.type?.base"
        :options="baseTypeOptions"
        option-label="label"
        option-value="value"
        size="small"
        class="w-24 shrink-0"
        @update:model-value="updateValueType"
      />
      <!-- The wrapper carries the flex classes: TypedValueControl is a
           fragment (v-if chain, no single root), so classes on the
           component itself never reach the rendered control. -->
      <div class="min-w-0 flex-1">
        <TypedValueControl
          :base="record.type?.base || 'json'"
          :type-id="record.type?.typeId || record.typeId || ''"
          :model-value="record.value"
          @update:model-value="value => update({ value })"
        />
      </div>
      <div v-if="oneLineOutput" class="relative flex shrink-0 items-center pr-3" :title="socketTitle(oneLineOutput)">
        <DesignerSocketHandle :socket="oneLineOutput" side="right" :title="socketTitle(oneLineOutput)" />
      </div>
    </div>
  </DesignerNodeCard>

  <DesignerNodeCard v-else :selected="selected" :faulted="faulted" size="lg" :primary="isOperation" :title="data.purpose || data.summary || ''">
    <!-- Label-dominant header: the label is the primary read; the whole
         header row carries the node-spec tooltip (the per-node `?`
         affordance is gone — quiet-card policy, node UI contract). A
         faulted node leads with its diagnostics. -->
    <div v-tooltip.bottom="faultTooltip" class="flex items-center gap-1.5">
      <i v-if="faulted" class="pi pi-exclamation-triangle shrink-0 text-status-danger" aria-hidden="true" />
      <strong class="min-w-0 flex-1 truncate text-label">{{ data.kindLabel || record.kind }}</strong>
    </div>
    <div v-if="faultMessages" class="mt-1.5 flex flex-col gap-1">
      <span v-for="message in faultMessages" :key="message" class="text-supporting text-status-danger">{{ message }}</span>
    </div>

    <div v-if="hasInlineConfiguration" class="nodrag nowheel mt-2 flex flex-col gap-1.5" @mousedown.stop @click.stop>
      <!-- One-row literal: type dropdown + value (SPEC "Node layouts");
           multiline data (list/tree) wraps below at the node's max
           width. -->
      <div
        v-if="showTypeEditor || operationOptions.length || opKind === 'source.literalItem'"
        class="flex items-center gap-1.5"
      >
        <Select
          v-if="opKind === 'source.literalItem' && record.type?.base === 'entityRef'"
          :model-value="record.typeId || record.type.typeId"
          :options="data.processTypeIdOptions || []"
          option-label="label"
          option-value="value"
          size="small"
          class="min-w-0 flex-1"
          @update:model-value="value => update({ typeId: value, type: { ...record.type, typeId: value } })"
        />
        <Select
          v-if="showTypeEditor"
          :model-value="record.type?.base"
          :options="baseTypeOptions"
          option-label="label"
          option-value="value"
          size="small"
          class="w-28 shrink-0"
          @update:model-value="updateValueType"
        />
        <Select
          v-if="operationOptions.length"
          :model-value="operationValue"
          :options="operationOptions"
          option-label="label"
          option-value="value"
          size="small"
          class="min-w-0 flex-1"
          @update:model-value="updateOperation"
        />
        <div v-if="opKind === 'source.literalItem'" class="min-w-0 flex-1">
          <TypedValueControl
            :base="record.type?.base || 'json'"
            :type-id="record.type?.typeId || record.typeId || ''"
            :model-value="record.value"
            @update:model-value="value => update({ value })"
          />
        </div>
      </div>
      <!-- The cast authoring row: the authored target base over the
           re-base vocabulary; the input accepts every source. -->
      <div v-if="opKind === 'value.cast'" class="flex items-center gap-1.5">
        <i class="pi pi-arrow-right text-muted" aria-hidden="true" />
        <Select
          :model-value="record.outputType?.base || 'record'"
          :options="castBaseOptions"
          option-label="label"
          option-value="value"
          size="small"
          class="min-w-0 flex-1"
          @update:model-value="value => update({ outputType: { base: value } })"
        />
      </div>
      <!-- Value-utility authoring: the operand base rides the record
           (`type`); format's template sits beside it, convertUnit's unit
           pair over the shared factor set. -->
      <div v-else-if="isTypedValueUtility" class="flex items-center gap-1.5">
        <Select
          :model-value="record.type?.base || 'json'"
          :options="baseTypeOptions"
          option-label="label"
          option-value="value"
          size="small"
          class="min-w-0 flex-1"
          @update:model-value="value => update({ type: { base: value } })"
        />
        <InputText
          v-if="opKind === 'value.format'"
          :model-value="record.template ?? ''"
          size="small"
          class="min-w-0 flex-1"
          @update:model-value="value => update({ template: String(value ?? '') })"
        />
      </div>
      <div v-else-if="opKind === 'value.convertUnit'" class="flex items-center gap-1.5">
        <Select
          :model-value="record.fromUnit || 'mm'"
          :options="convertUnitOptions"
          option-label="label"
          option-value="value"
          size="small"
          class="min-w-0 flex-1"
          @update:model-value="value => update({ fromUnit: value })"
        />
        <i class="pi pi-arrow-right text-muted" aria-hidden="true" />
        <Select
          :model-value="record.toUnit || 'm'"
          :options="convertUnitOptions"
          option-label="label"
          option-value="value"
          size="small"
          class="min-w-0 flex-1"
          @update:model-value="value => update({ toUnit: value })"
        />
      </div>
      <Textarea
        v-if="['source.literalList', 'source.literalTree'].includes(opKind)"
        :model-value="literalStructureDisplay"
        class="w-full"
        rows="3"
        auto-resize
        @update:model-value="updateLiteralStructure"
      />
    </div>

    <div v-if="socketRows.length" class="-mx-2.5 mt-2 flex flex-col">
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
          <Button
            :icon="outputVisible(row.output.id) ? 'pi pi-eye' : 'pi pi-eye-slash'"
            :class="outputVisible(row.output.id) ? 'text-muted' : 'text-status-info'"
            text
            rounded
            size="small"
            :aria-label="outputVisible(row.output.id) ? $t('processDesigner.previewOutputHide') : $t('processDesigner.previewOutputShow')"
            v-tooltip.top="outputVisible(row.output.id) ? $t('processDesigner.previewOutputHide') : $t('processDesigner.previewOutputShow')"
            class="nodrag !absolute -right-1 top-1/2 -translate-y-1/2"
            @mousedown.stop
            @click.stop="togglePreviewOutput(row.output.id)"
          />
        </div>
      </div>
    </div>

    <!-- The event section renders an effect's event sockets as ordinary
         socket rows (node UI contract): wired or manual reads from
         whether a wire is attached. -->
    <div v-if="eventSocketRows.length" class="-mx-2.5 mt-3">
      <div v-for="row in eventSocketRows" :key="row.key" class="flex min-h-7 items-center gap-x-5">
        <div v-if="row.input" :class="socketClass(row.input, 'left')" :title="socketTitle(row.input)">
          <DesignerSocketHandle :socket="row.input" side="left" :title="socketTitle(row.input)" />
          <span class="block truncate text-supporting">{{ row.input.label }}</span>
        </div>
        <div v-if="row.output" :class="socketClass(row.output, 'right')" :title="socketTitle(row.output)">
          <DesignerSocketHandle :socket="row.output" side="right" :title="socketTitle(row.output)" />
          <span class="block truncate text-supporting">{{ row.output.label }}</span>
        </div>
      </div>
    </div>
  </DesignerNodeCard>
</template>

<script setup>
import { operationKindOf } from '~/packages/cts/src/index.js';
import { isSecondaryPopulationKind } from '~/utils/processDesignerPopulation.js';

import { computed } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Select from '~/components/shared/InstanceSelect.vue';
import Textarea from 'primevue/textarea';
import { useI18n } from 'vue-i18n';
import {
  CAST_BASES,
  CONVERT_UNITS,
  EFFECT_SPECIES_KINDS,
  MAPPED_MUTATION_SPECIES_KINDS, formatProcessType } from '~/packages/processes/src/index.js';
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
const faultTooltip = computed(() => ({
  value: [...(faultMessages.value || []), nodeSpecTooltip.value?.value].filter(Boolean).join('\n')
}));
const eventSocketRows = computed(() => alignSockets(eventInputs.value, eventOutputs.value, 'event'));
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

// Per-output preview visibility (SPEC §28): `previewOutputs` on the
// record selects the outputs the preview channels carry; absent means
// every output feeds them. The field collapses back to null when the
// selection covers everything again.
function outputVisible(id) {
  const selection = record.value.previewOutputs;
  return !Array.isArray(selection) || selection.includes(id);
}

function togglePreviewOutput(id) {
  const ports = dataOutputs.value.map(output => output.id);
  const current = ports.filter(outputVisible);
  const next = current.includes(id)
    ? current.filter(candidate => candidate !== id)
    : [...current, id];
  update({ previewOutputs: ports.every(port => next.includes(port)) ? null : next });
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
