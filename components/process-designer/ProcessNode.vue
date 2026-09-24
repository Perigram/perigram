<template>
  <div :class="nodeFrameClass" :title="data.purpose || data.summary || ''">
    <div :class="['absolute inset-x-0 top-0 h-0.5 rounded-t-ui', accent.stripe]"></div>
    <div class="flex items-center gap-1.5 border-b border-content-border pb-1.5">
      <span :class="['flex h-5 w-5 shrink-0 items-center justify-center rounded-ui bg-subtle text-supporting', accent.icon]">
        <i :class="record.icon || data.icon || 'pi pi-sitemap'" aria-hidden="true"></i>
      </span>
      <strong class="min-w-0 flex-1 truncate text-label">{{ data.kindLabel || record.kind }}</strong>
      <i
        v-tooltip.right="nodeSpecTooltip"
        class="pi pi-question-circle nowheel cursor-help text-muted"
        :aria-label="$t('processDesigner.nodeSpec')"
      />
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
      <Select
        v-if="showsFieldSelect"
        :model-value="record.path"
        :options="fieldOptions"
        option-label="label"
        option-value="value"
        size="small"
        filter
        @update:model-value="value => update({ path: value })"
      />
      <InputText
        v-if="opKind === 'source.literalItem' && record.type?.base === 'entityRef'"
        :model-value="record.value?.id || ''"
        size="small"
        :placeholder="$t('common.id')"
        @update:model-value="value => update({ value: value ? { type: record.type?.typeId || record.typeId || '', id: value } : null })"
      />
      <TypedValueControl
        v-if="opKind === 'source.literalItem' && record.type?.base !== 'entityRef'"
        :base="record.type?.base || 'json'"
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

    <div v-if="socketRows.length" class="mt-2 flex flex-col">
      <div v-for="row in socketRows" :key="row.key" class="grid min-h-7 grid-cols-2 gap-x-5">
        <div v-if="row.input" :class="socketClass(row.input, 'left')" :title="socketTitle(row.input)">
          <Handle
            :id="mintProcessSocketHandle(row.input)"
            type="target"
            :position="Position.Left"
            :class="handleClass(row.input, 'left')"
            :style="handleStyle(row.input)"
            :aria-label="socketTitle(row.input)"
          />
          <span class="block truncate text-supporting">{{ row.input.label }}</span>
          <div v-if="showInlineFallback(row.input)" class="nodrag nowheel mt-0.5" @mousedown.stop @click.stop>
            <TypedValueControl
              :base="row.input.base"
              :model-value="inputDefault(row.input.id)"
              :status-options="data.processStatusOptions || []"
              :placeholder="inputPlaceholder(row.input)"
              @update:model-value="value => onFallbackValue(row.input, value)"
            />
          </div>
        </div>
        <div v-else></div>
        <div v-if="row.output" :class="socketClass(row.output, 'right')" :title="socketTitle(row.output)">
          <Handle
            :id="mintProcessSocketHandle(row.output)"
            type="source"
            :position="Position.Right"
            :class="handleClass(row.output, 'right')"
            :style="handleStyle(row.output)"
            :aria-label="socketTitle(row.output)"
          />
          <span class="block truncate text-supporting">{{ row.output.label }}</span>
        </div>
        <div v-else></div>
      </div>
    </div>

    <div v-if="eventSocketRows.length" class="mt-2 border-t border-content-border pt-2">
      <label
        v-if="opKind.startsWith('effect.')"
        class="nodrag nowheel mb-1.5 flex min-h-7 cursor-pointer items-center justify-between gap-2"
        @mousedown.stop
        @click.stop
      >
        <span class="text-supporting">{{ autoTriggerLabel }}</span>
        <ToggleSwitch
          :model-value="record.trigger?.mode === 'event'"
          @update:model-value="value => updateEffectTriggerMode(value ? 'event' : 'manual')"
        />
      </label>
      <div v-for="row in eventSocketRows" :key="row.key" class="grid min-h-7 grid-cols-2 gap-x-5">
        <div v-if="row.input" :class="socketClass(row.input, 'left')" :title="socketTitle(row.input)">
          <Handle :id="mintProcessSocketHandle(row.input)" type="target" :position="Position.Left" :class="handleClass(row.input, 'left')" :style="handleStyle(row.input)" />
          <span class="block truncate text-supporting">{{ row.input.label }}</span>
        </div>
        <div v-else></div>
        <div v-if="row.output" :class="socketClass(row.output, 'right')" :title="socketTitle(row.output)">
          <Handle :id="mintProcessSocketHandle(row.output)" type="source" :position="Position.Right" :class="handleClass(row.output, 'right')" :style="handleStyle(row.output)" />
          <span class="block truncate text-supporting">{{ row.output.label }}</span>
        </div>
        <div v-else></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { operationKindOf } from '~/packages/cts/src/index.js';

import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import InputText from 'primevue/inputtext';
import Select from '~/components/shared/InstanceSelect.vue';
import Textarea from 'primevue/textarea';
import ToggleSwitch from 'primevue/toggleswitch';
import { useI18n } from 'vue-i18n';
import { formatProcessType, mintProcessSocketHandle } from '~/packages/processes/src/index.js';
import { nodeSpecSummary, socketSpecLine } from '~/composables/useNodeSpec.js';
import { processSocketHandleStyle } from '~/utils/processDesignerSocketTone.js';
import TypedValueControl from './TypedValueControl.vue';

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  selected: { type: Boolean, default: false }
});
const { t } = useI18n();

const record = computed(() => props.data.processNodeRecord || props.data);
const opKind = computed(() => operationKindOf(record.value || {}));
const inputSpecs = computed(() => normalizeSpecs(record.value.inputs || props.data.inputSpecs || []));
const outputSpecs = computed(() => normalizeSpecs(record.value.outputs || props.data.outputSpecs || []));
const dataInputs = computed(() => inputSpecs.value.filter(input => input.role === 'data'));
const dataOutputs = computed(() => outputSpecs.value.filter(output => output.role === 'data'));
const eventInputs = computed(() => inputSpecs.value.filter(input => input.role !== 'data'));
const eventOutputs = computed(() => outputSpecs.value.filter(output => output.role !== 'data'));
const socketRows = computed(() => alignSockets(dataInputs.value, dataOutputs.value, 'data'));

// The "?" tooltip: what the node does + what its sockets expect and output
// (SPEC §8/§20 vocabulary, presentation only).
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
const fieldOptions = computed(() => props.data.processFieldOptions || []);
const showsFieldSelect = computed(() => fieldOptions.value.length > 0);

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
  || fieldOptions.value.length > 0
  || opKind.value.startsWith('source.literal')
));
const nodeFrameClass = computed(() => [
  'relative w-72 rounded-ui border bg-content p-2.5 pt-3 shadow-card transition-colors',
  props.selected ? 'border-primary' : 'border-content-border'
]);
const accent = computed(() => {
  if (opKind.value.startsWith('read.')) return { stripe: 'bg-signal-structure', icon: 'text-signal-structure' };
  if (opKind.value.startsWith('record.')) return { stripe: 'bg-signal-entity', icon: 'text-signal-entity' };
  if (opKind.value.startsWith('predicate.') || opKind.value.includes('compare') || opKind.value.includes('logic')) {
    return { stripe: 'bg-signal-decision', icon: 'text-signal-decision' };
  }
  if (opKind.value.startsWith('effect.')) return { stripe: 'bg-signal-effect', icon: 'text-signal-effect' };
  if (opKind.value.startsWith('control.')) return { stripe: 'bg-signal-external', icon: 'text-signal-external' };
  return { stripe: 'bg-signal-value', icon: 'text-signal-value' };
});

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

function updateEffectTriggerMode(mode) {
  if (!mode) return;
  update({ trigger: { mode: mode === 'event' ? 'event' : 'manual' } });
}

const autoTriggerLabel = computed(() => (
  (props.data.processTriggerModeOptions || []).find(option => option.value === 'event')?.label || 'Auto'
));

function updateValueType(base) {
  const updates = { type: { ...(record.value.type || {}), base } };
  if (opKind.value.startsWith('source.literal')) {
    updates.value = base === 'boolean' ? false
      : ['number', 'integer'].includes(base) ? 0
        : base === 'json' ? {}
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
// TypedValueControl; an entityRef id string wraps into { type, id } here
// because the entity type is this socket's contract, not the control's.
function onFallbackValue(input, value) {
  if (input.base === 'status') return updateStatusInputDefault(input.id, value);
  const wrapped = input.base === 'entityRef' && value
    ? { type: input.type?.typeId || '', id: value }
    : value;
  return updateInputDefault(input.id, wrapped);
}

function inputPlaceholder(input) {
  if (input.base === 'status') return t('processDesigner.transitionStatusValue');
  if (input.base === 'entityRef') {
    return t('processDesigner.instanceIdFallback', { entity: input.type?.typeId || t('processDesigner.entity') });
  }
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
    'relative min-w-0 border-b border-content-border py-1',
    side === 'left' ? 'pl-3' : 'pr-3 text-right'
  ];
}

function handleClass(item, side) {
  return [
    '!top-1/2 !h-3 !w-3 !-translate-y-1/2',
    item.access === 'tree' ? '!rounded-none' : item.access === 'list' ? '!rounded-sm' : '!rounded-full',
    side === 'left' ? '!left-0 !-translate-x-1/2' : '!right-0 !translate-x-1/2'
  ];
}

function handleStyle(item) {
  return processSocketHandleStyle(item);
}
</script>
