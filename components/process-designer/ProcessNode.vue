<template>
  <DesignerNodeCard :selected="selected" size="lg" :primary="isOperation" :title="data.purpose || data.summary || ''">
    <!-- Label-dominant header: the label is the primary read; the whole
         header row carries the node-spec tooltip (the per-node `?`
         affordance is gone — quiet-card policy, node UI contract). -->
    <div v-tooltip.bottom="nodeSpecTooltip" class="flex items-center gap-1.5">
      <strong class="min-w-0 flex-1 truncate text-label">{{ data.kindLabel || record.kind }}</strong>
    </div>

    <div v-if="hasInlineConfiguration" class="nodrag nowheel mt-2 flex flex-col gap-1.5" @mousedown.stop @click.stop>
      <Select
        v-if="opKind === 'source.literalItem' && record.type?.base === 'entityRef'"
        :model-value="record.typeId || record.type.typeId"
        :options="data.processTypeIdOptions || []"
        option-label="label"
        option-value="value"
        size="small"
        @update:model-value="value => update({ typeId: value, type: { ...record.type, typeId: value } })"
      />
      <div v-if="showTypeEditor">
        <Select
          :model-value="record.type?.base"
          :options="baseTypeOptions"
          option-label="label"
          option-value="value"
          size="small"
          @update:model-value="updateValueType"
        />
      </div>
      <Select
        v-if="operationOptions.length"
        :model-value="operationValue"
        :options="operationOptions"
        option-label="label"
        option-value="value"
        size="small"
        @update:model-value="updateOperation"
      />
      <TypedValueControl
        v-if="opKind === 'source.literalItem'"
        :base="record.type?.base || 'json'"
        :type-id="record.type?.typeId || record.typeId || ''"
        :model-value="record.value"
        @update:model-value="value => update({ value })"
      />
      <Textarea
        v-if="['source.literalList', 'source.literalTree'].includes(opKind)"
        :model-value="literalStructureDisplay"
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
          <div v-if="showInlineFallback(row.input)" class="nodrag nowheel mt-0.5" @mousedown.stop @click.stop>
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

import { computed } from 'vue';
import InputText from 'primevue/inputtext';
import Select from '~/components/shared/InstanceSelect.vue';
import Textarea from 'primevue/textarea';
import { useI18n } from 'vue-i18n';
import { formatProcessType } from '~/packages/processes/src/index.js';
import { nodeSpecSummary, socketSpecLine } from '~/composables/useNodeSpec.js';
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
// Population primacy (node UI contract): operations (the effect species)
// are the primary nodes and render the strong-ink border; every other
// species is secondary surface.
const isOperation = computed(() => String(opKind.value || '').startsWith('effect.'));
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
  const sections = [nodeSpecSummary(record.value, formatProcessType)];
  if (dataInputs.value.length) {
    sections.push(`Expects: ${dataInputs.value.map(input => socketSpecLine(input, formatProcessType)).join(' • ')}`);
  }
  if (dataOutputs.value.length) {
    sections.push(`Outputs: ${dataOutputs.value.map(output => socketSpecLine(output, formatProcessType)).join(' • ')}`);
  }
  return { value: sections.filter(Boolean).join(' — ') };
});
const eventSocketRows = computed(() => alignSockets(eventInputs.value, eventOutputs.value, 'event'));
const connectedInputs = computed(() => new Set(props.data.processConnectedInputIds || []));
const operationOptions = computed(() => props.data.processOperationOptions || []);
const showTypeEditor = computed(() => (
  opKind.value.startsWith('source.literal')
  || (opKind.value === 'value.logic'
    && ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'startsWith', 'endsWith', 'isNull', 'isNotNull'].includes(record.value.operation))
));
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
const literalStructureDisplay = computed(() => (
  typeof record.value.value === 'string' ? record.value.value : JSON.stringify(record.value.value, null, 2)
));
const hasInlineConfiguration = computed(() => (
  showTypeEditor.value
  || operationOptions.value.length
  || opKind.value.startsWith('source.literal')
));
function update(updates) {
  props.data.onProcessNodeUpdate?.(updates);
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
  return ['string', 'id', 'number', 'integer', 'boolean', 'json', 'date', 'dateTime', 'duration', 'enum', 'status', 'entityRef'].includes(input.base)
    && (input.access === 'item'
      // Mapped mutation sockets declare List consumption; an inline scalar
      // fallback is stored as one broadcast item.
      || (input.access === 'list' && ['effect.createEntity', 'effect.updateEntity', 'effect.changeStatus'].includes(opKind.value)));
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
    'relative min-w-0 py-1.5',
    side === 'left' ? 'pl-3' : 'ml-auto pr-3 text-right'
  ];
}

</script>
