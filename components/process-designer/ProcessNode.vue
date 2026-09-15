<template>
  <div :class="nodeFrameClass" :title="data.purpose || data.summary || ''">
    <div :class="['absolute inset-x-0 top-0 h-0.5 rounded-t-ui', accent.stripe]"></div>
    <div class="flex items-center gap-1.5 border-b border-content-border pb-1.5">
      <span :class="['flex h-5 w-5 shrink-0 items-center justify-center rounded-ui bg-subtle text-supporting', accent.icon]">
        <i :class="record.icon || data.icon || 'pi pi-sitemap'" aria-hidden="true"></i>
      </span>
      <strong class="min-w-0 flex-1 truncate text-color text-label">{{ data.kindLabel || record.kind }}</strong>
    </div>

    <div v-if="hasInlineConfiguration" class="nodrag nowheel mt-2 flex flex-col gap-1.5" @mousedown.stop @click.stop>
      <Select
        v-if="showEntitySelect"
        :model-value="record.entityType"
        :options="data.processEntityTypeOptions || []"
        option-label="label"
        option-value="value"
        size="small"
        @update:model-value="value => update({ entityType: value })"
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
        v-if="record.kind === 'control.domainEventTrigger'"
        :model-value="record.eventId"
        :options="data.processEventOptions || []"
        option-label="label"
        option-value="value"
        size="small"
        @update:model-value="value => update({ eventId: value })"
      />
      <Select
        v-if="showBlockSelect"
        :model-value="record.block"
        :options="data.processBlockOptions || []"
        option-label="label"
        option-value="value"
        size="small"
        @update:model-value="value => update({ block: value })"
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
        v-if="record.kind === 'source.literalItem' && record.type?.base === 'entityRef'"
        :model-value="record.value?.id || ''"
        size="small"
        :placeholder="$t('common.id')"
        @update:model-value="value => update({ value: value ? { type: record.type?.entityType || record.entityType || '', id: value } : null })"
      />
      <InputText
        v-if="record.kind === 'source.literalItem' && !['entityRef', 'number', 'integer', 'boolean', 'date', 'dateTime', 'status'].includes(record.type?.base)"
        :model-value="literalDisplay"
        size="small"
        @update:model-value="updateLiteral"
      />
      <InputNumber
        v-if="record.kind === 'source.literalItem' && ['number', 'integer'].includes(record.type?.base)"
        :model-value="Number(record.value) || 0"
        size="small"
        @update:model-value="value => update({ value })"
      />
      <ToggleSwitch
        v-if="record.kind === 'source.literalItem' && record.type?.base === 'boolean'"
        :model-value="Boolean(record.value)"
        @update:model-value="value => update({ value })"
      />
      <DatePicker
        v-if="record.kind === 'source.literalItem' && ['date', 'dateTime'].includes(record.type?.base)"
        :model-value="literalDate"
        :show-time="record.type?.base === 'dateTime'"
        hour-format="24"
        size="small"
        @update:model-value="value => update({ value: serializeLiteralDate(value) })"
      />
      <Select
        v-if="record.kind === 'source.literalItem' && record.type?.base === 'status'"
        :model-value="record.value"
        :options="data.processStatusOptions || []"
        option-label="label"
        option-value="value"
        size="small"
        @update:model-value="value => update({ value })"
      />
      <Textarea
        v-if="['source.literalList', 'source.literalTree'].includes(record.kind)"
        :model-value="literalDisplay"
        rows="3"
        auto-resize
        @update:model-value="updateLiteral"
      />
    </div>

    <div v-if="socketRows.length" class="mt-2 flex flex-col">
      <div v-for="row in socketRows" :key="row.key" class="grid min-h-7 grid-cols-2 gap-x-5">
        <div v-if="row.input" :class="socketClass(row.input, 'left')" :title="socketTitle(row.input)">
          <Handle
            :id="socketHandleId(row.input)"
            type="target"
            :position="Position.Left"
            :class="handleClass(row.input, 'left')"
            :style="handleStyle(row.input)"
            :aria-label="socketTitle(row.input)"
          />
          <span class="block truncate text-supporting">{{ row.input.label }}</span>
          <div v-if="showInlineFallback(row.input)" class="nodrag nowheel mt-0.5" @mousedown.stop @click.stop>
            <ToggleSwitch
              v-if="row.input.base === 'boolean'"
              :model-value="Boolean(inputDefault(row.input.id))"
              @update:model-value="value => updateInputDefault(row.input.id, value)"
            />
            <InputNumber
              v-else-if="['number', 'integer'].includes(row.input.base)"
              :model-value="numericInputDefault(row.input.id)"
              size="small"
              class="w-full min-w-0"
              :placeholder="$t('processDesigner.inlineValue')"
              @update:model-value="value => updateInputDefault(row.input.id, value)"
            />
            <Select
              v-else-if="row.input.base === 'status'"
              :model-value="inputDefault(row.input.id)"
              :options="data.processStatusOptions || []"
              option-label="label"
              option-value="value"
              size="small"
              class="w-full min-w-0"
              @update:model-value="value => updateStatusInputDefault(row.input.id, value)"
            />
            <DatePicker
              v-else-if="['date', 'dateTime'].includes(row.input.base)"
              :model-value="dateInputDefault(row.input.id)"
              :show-time="row.input.base === 'dateTime'"
              hour-format="24"
              size="small"
              class="w-full min-w-0"
              @update:model-value="value => updateInputDefault(row.input.id, serializeDateInput(row.input, value))"
            />
            <InputText
              v-else
              :model-value="displayInputDefault(row.input.id)"
              size="small"
              class="w-full min-w-0"
              :placeholder="inputPlaceholder(row.input)"
              @update:model-value="value => updateInputDefault(row.input.id, parseInputDefault(row.input, value))"
            />
          </div>
        </div>
        <div v-else></div>
        <div v-if="row.output" :class="socketClass(row.output, 'right')" :title="socketTitle(row.output)">
          <Handle
            :id="socketHandleId(row.output)"
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
        v-if="record.kind?.startsWith('effect.')"
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
          <Handle :id="socketHandleId(row.input)" type="target" :position="Position.Left" :class="handleClass(row.input, 'left')" :style="handleStyle(row.input)" />
          <span class="block truncate text-supporting">{{ row.input.label }}</span>
        </div>
        <div v-else></div>
        <div v-if="row.output" :class="socketClass(row.output, 'right')" :title="socketTitle(row.output)">
          <Handle :id="socketHandleId(row.output)" type="source" :position="Position.Right" :class="handleClass(row.output, 'right')" :style="handleStyle(row.output)" />
          <span class="block truncate text-supporting">{{ row.output.label }}</span>
        </div>
        <div v-else></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import DatePicker from 'primevue/datepicker';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Select from '~/components/shared/EntitySelect.vue';
import Textarea from 'primevue/textarea';
import ToggleSwitch from 'primevue/toggleswitch';
import { useI18n } from 'vue-i18n';
import { formatProcessType } from '~/packages/processes/src/index.js';
import { processSocketHandleStyle } from '~/utils/processDesignerSocketTone.js';

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  selected: { type: Boolean, default: false }
});
const { t } = useI18n();

const record = computed(() => props.data.processNodeRecord || props.data);
const inputSpecs = computed(() => normalizeSpecs(record.value.inputs || props.data.inputSpecs || []));
const outputSpecs = computed(() => normalizeSpecs(record.value.outputs || props.data.outputSpecs || []));
const dataInputs = computed(() => inputSpecs.value.filter(input => input.role === 'data'));
const dataOutputs = computed(() => outputSpecs.value.filter(output => output.role === 'data'));
const eventInputs = computed(() => inputSpecs.value.filter(input => input.role !== 'data'));
const eventOutputs = computed(() => outputSpecs.value.filter(output => output.role !== 'data'));
const socketRows = computed(() => alignSockets(dataInputs.value, dataOutputs.value, 'data'));
const eventSocketRows = computed(() => alignSockets(eventInputs.value, eventOutputs.value, 'event'));
const connectedInputs = computed(() => new Set(props.data.processConnectedInputIds || []));
const operationOptions = computed(() => props.data.processOperationOptions || []);
const fieldOptions = computed(() => props.data.processFieldOptions || []);
const showsFieldSet = computed(() => [
  'record.composeBlock',
  'record.modifyBlock'
].includes(record.value.kind));
const showsFieldSelect = computed(() => (
  fieldOptions.value.length > 0
  && !showsFieldSet.value
  && !(fieldOptions.value.length === 1 && fieldOptions.value[0].value === record.value.block)
));
const showEntitySelect = computed(() => (!record.value.entityTypeInferred && (
  (['record.', 'predicate.', 'read.', 'effect.'].some(prefix => record.value.kind?.startsWith(prefix))
    && !['record.getField', 'record.composeBlock', 'record.modifyBlock', 'record.construct', 'effect.runCommand', 'effect.runProducer'].includes(record.value.kind))
  || record.value.kind === 'control.entityChangedTrigger'
  || (record.value.kind === 'control.manualTrigger' && record.value.entityType)
  || (record.value.kind === 'source.literalItem' && record.value.type?.base === 'entityRef')
)));
const showBlockSelect = computed(() => (
  ['record.getBlock', 'record.getField', 'record.composeBlock', 'record.modifyBlock'].includes(record.value.kind)
  && (props.data.processBlockOptions || []).length
));
const showTypeEditor = computed(() => (
  record.value.kind?.startsWith('source.literal')
  || (record.value.kind === 'value.logic'
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
  'entityRef',
  'status'
].map(value => ({ label: t(`processDesigner.dataTypes.${value}`), value })));
const literalDisplay = computed(() => {
  if (record.value.type?.base === 'entityRef') return record.value.value?.id || '';
  return typeof record.value.value === 'string'
    ? record.value.value
    : JSON.stringify(record.value.value, null, 2);
});
const literalDate = computed(() => {
  if (!record.value.value) return null;
  const value = new Date(record.value.value);
  return Number.isNaN(value.getTime()) ? null : value;
});
const hasInlineConfiguration = computed(() => (
  showEntitySelect.value
  || showTypeEditor.value
  || operationOptions.value.length
  || record.value.kind === 'control.domainEventTrigger'
  || showBlockSelect.value
  || (fieldOptions.value.length && !showsFieldSet.value)
  || record.value.kind?.startsWith('source.literal')
));
const nodeFrameClass = computed(() => [
  'relative w-72 rounded-ui border bg-content p-2.5 pt-3 shadow-card transition-colors',
  props.selected ? 'border-primary' : 'border-content-border'
]);
const accent = computed(() => {
  if (record.value.kind?.startsWith('read.')) return { stripe: 'bg-signal-structure', icon: 'text-signal-structure' };
  if (record.value.kind?.startsWith('record.')) return { stripe: 'bg-signal-entity', icon: 'text-signal-entity' };
  if (record.value.kind?.startsWith('predicate.') || record.value.kind?.includes('compare') || record.value.kind?.includes('logic')) {
    return { stripe: 'bg-signal-decision', icon: 'text-signal-decision' };
  }
  if (record.value.kind?.startsWith('effect.')) return { stripe: 'bg-signal-effect', icon: 'text-signal-effect' };
  if (record.value.kind?.startsWith('control.')) return { stripe: 'bg-signal-external', icon: 'text-signal-external' };
  return { stripe: 'bg-signal-value', icon: 'text-signal-value' };
});

function update(updates) {
  props.data.onProcessNodeUpdate?.(updates);
}

const operationValue = computed(() => (
  record.value.kind === 'collection.sort'
    ? record.value.direction || 'asc'
    : record.value.operation
));

function updateOperation(value) {
  update(record.value.kind === 'collection.sort' ? { direction: value } : { operation: value });
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
  if (record.value.kind?.startsWith('source.literal')) {
    updates.value = base === 'boolean' ? false
      : ['number', 'integer'].includes(base) ? 0
        : base === 'json' ? {}
          : '';
    if (base === 'entityRef') {
      updates.entityType = record.value.entityType || props.data.processEntityTypeOptions?.[0]?.value || '';
      updates.type.entityType = updates.entityType;
    }
  }
  update(updates);
}

function updateLiteral(value) {
  if (record.value.type?.base === 'number') return update({ value: Number(value) });
  if (record.value.type?.base === 'integer') return update({ value: Number.parseInt(value, 10) });
  if (record.value.type?.base === 'boolean') return update({ value: value === true || value === 'true' });
  if (record.value.type?.base === 'entityRef') {
    return update({ value: value ? { type: record.value.entityType, id: value } : null });
  }
  if (record.value.access !== 'item' || record.value.type?.base === 'json') {
    try {
      update({ value: JSON.parse(value) });
    } catch {
      update({ value });
    }
    return;
  }
  update({ value });
}

function serializeLiteralDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return record.value.type?.base === 'date' ? date.toISOString().slice(0, 10) : date.toISOString();
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
      || (input.access === 'list' && ['effect.createEntity', 'effect.updateEntity', 'effect.changeStatus'].includes(record.value.kind)));
}

function inputDefault(id) {
  const value = record.value.inputDefaults?.[id];
  if (!value?.branches) return value;
  return value.branches[0]?.items?.[0];
}

function displayInputDefault(id) {
  const value = inputDefault(id);
  if (value == null) return '';
  if (typeof value === 'object' && value.id) return String(value.id);
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function numericInputDefault(id) {
  const value = inputDefault(id);
  return value == null || value === '' ? null : Number(value);
}

function dateInputDefault(id) {
  const value = inputDefault(id);
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function serializeDateInput(input, value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return input.base === 'date' ? date.toISOString().slice(0, 10) : date.toISOString();
}

function parseInputDefault(input, value) {
  if (input.base === 'entityRef') {
    return value ? { type: input.type?.entityType || '', id: value } : null;
  }
  if (input.base === 'json') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function inputPlaceholder(input) {
  if (input.base === 'entityRef') {
    return t('processDesigner.entityIdFallback', { entity: input.type?.entityType || t('processDesigner.entity') });
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
  const option = (props.data.processStatusOptions || []).find(item => item.value === value);
  update({
    inputDefaults: { ...(record.value.inputDefaults || {}), [id]: { branches: [{ path: [], items: [value] }] } },
    statusRef: option?.refId || '',
    status: { ...(record.value.status || {}), to: value }
  });
}

function socketHandleId(item) {
  return `${item.role === 'data' ? 'data' : 'control'}:${item.id}`;
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
