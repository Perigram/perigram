<template>
  <div :class="nodeFrameClass">
    <div :class="['absolute inset-x-0 top-0 h-1 rounded-t-ui', accent.stripe]"></div>
    <div class="flex items-center gap-2">
      <i :class="[record.icon || data.icon || 'pi pi-sitemap', accent.icon]"></i>
      <div class="min-w-0 flex-1">
        <strong :class="['block truncate text-sm', accent.title]">{{ data.kindLabel || record.kind }}</strong>
        <span v-if="data.summary" class="block truncate text-xs text-muted-color">{{ data.summary }}</span>
      </div>
    </div>

    <div v-if="hasInlineConfiguration" class="nodrag nowheel mt-2 flex flex-col gap-2" @mousedown.stop @click.stop>
      <Select
        v-if="showEntitySelect"
        :model-value="record.entityType"
        :options="data.processEntityTypeOptions || []"
        option-label="label"
        option-value="value"
        size="small"
        @update:model-value="value => update({ entityType: value })"
      />
      <div v-if="showTypeEditor" class="grid grid-cols-2 gap-1">
        <Select
          :model-value="record.type?.base"
          :options="baseTypeOptions"
          size="small"
          @update:model-value="value => update({ type: { ...(record.type || {}), base: value } })"
        />
        <Select
          :model-value="record.type?.shape || 'item'"
          :options="shapeOptions"
          size="small"
          @update:model-value="value => update({ type: { ...(record.type || {}), shape: value } })"
        />
      </div>
      <Select
        v-if="operationOptions.length"
        :model-value="record.operation"
        :options="operationOptions"
        option-label="label"
        option-value="value"
        size="small"
        @update:model-value="value => update({ operation: value })"
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
        v-if="fieldOptions.length"
        :model-value="record.path"
        :options="fieldOptions"
        option-label="label"
        option-value="value"
        size="small"
        filter
        @update:model-value="value => update({ path: value })"
      />
      <InputText
        v-if="record.kind === 'source.literalItem'"
        :model-value="literalDisplay"
        size="small"
        @update:model-value="updateLiteral"
      />
      <Textarea
        v-if="['source.literalList', 'source.literalTree'].includes(record.kind)"
        :model-value="literalDisplay"
        rows="3"
        auto-resize
        @update:model-value="updateLiteral"
      />
    </div>

    <div class="mt-2 grid grid-cols-2 gap-2">
      <div class="flex flex-col gap-1">
        <div v-for="input in inputSpecs" :key="input.id" :class="socketClass(input, 'left')">
          <Handle :id="socketHandleId(input)" type="target" :position="Position.Left" :class="handleClass(input, 'left')" />
          <span class="flex min-w-0 items-center gap-1 text-xs">
            <Badge v-if="input.required && !input.connected" value="!" severity="danger" size="small" />
            <span class="truncate">{{ input.label }}</span>
            <span class="shrink-0 text-[10px] text-muted-color">{{ input.typeLabel }}</span>
          </span>
        </div>
      </div>
      <div class="flex flex-col gap-1">
        <div v-for="output in outputSpecs" :key="output.id" :class="socketClass(output, 'right')">
          <Handle :id="socketHandleId(output)" type="source" :position="Position.Right" :class="handleClass(output, 'right')" />
          <span class="flex min-w-0 items-center justify-end gap-1 text-xs">
            <span class="shrink-0 text-[10px] text-muted-color">{{ output.typeLabel }}</span>
            <span class="truncate">{{ output.label }}</span>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import Badge from 'primevue/badge';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import Textarea from 'primevue/textarea';
import { formatProcessType } from '~/packages/processes/src/index.js';

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  selected: { type: Boolean, default: false }
});

const record = computed(() => props.data.processNodeRecord || props.data);
const connectedInputs = computed(() => new Set(props.data.processConnectedInputIds || []));
const inputSpecs = computed(() => normalizeSpecs(record.value.inputs || props.data.inputSpecs || [], true));
const outputSpecs = computed(() => normalizeSpecs(record.value.outputs || props.data.outputSpecs || [], false));
const operationOptions = computed(() => props.data.processOperationOptions || []);
const fieldOptions = computed(() => props.data.processFieldOptions || []);
const showEntitySelect = computed(() => (
  ['record.', 'predicate.', 'read.', 'effect.'].some(prefix => record.value.kind?.startsWith(prefix))
));
const showBlockSelect = computed(() => record.value.kind === 'record.getBlock' && (props.data.processBlockOptions || []).length);
const showTypeEditor = computed(() => (
  record.value.kind?.startsWith('source.literal')
  || ['value.cast', 'value.parse', 'value.convertUnit'].includes(record.value.kind)
));
const baseTypeOptions = ['string', 'number', 'integer', 'boolean', 'json', 'date', 'dateTime', 'duration', 'enum', 'entityRef', 'status'];
const shapeOptions = ['item', 'list', 'tree'];
const literalDisplay = computed(() => typeof record.value.value === 'string'
  ? record.value.value
  : JSON.stringify(record.value.value, null, 2));
const hasInlineConfiguration = computed(() => (
  showEntitySelect.value
  || showTypeEditor.value
  || operationOptions.value.length
  || showBlockSelect.value
  || fieldOptions.value.length
  || record.value.kind?.startsWith('source.literal')
));
const nodeFrameClass = computed(() => [
  'relative min-w-64 rounded-ui border bg-content p-2 pt-3 shadow-card transition-colors',
  props.selected ? 'border-primary ring-2 ring-primary-200' : 'border-content-border'
]);
const accent = computed(() => {
  if (record.value.kind?.startsWith('read.')) return { stripe: 'bg-cyan-500', icon: 'text-cyan-600', title: 'text-cyan-700' };
  if (record.value.kind?.startsWith('record.')) return { stripe: 'bg-sky-500', icon: 'text-sky-600', title: 'text-sky-700' };
  if (record.value.kind?.startsWith('predicate.') || record.value.kind?.includes('compare') || record.value.kind?.includes('logic')) {
    return { stripe: 'bg-amber-500', icon: 'text-amber-600', title: 'text-amber-700' };
  }
  if (record.value.kind?.startsWith('effect.')) return { stripe: 'bg-rose-500', icon: 'text-rose-600', title: 'text-rose-700' };
  if (record.value.kind?.startsWith('control.')) return { stripe: 'bg-orange-500', icon: 'text-orange-600', title: 'text-orange-700' };
  return { stripe: 'bg-violet-500', icon: 'text-violet-600', title: 'text-violet-700' };
});

function update(updates) {
  props.data.onProcessNodeUpdate?.(updates);
}

function updateLiteral(value) {
  if (record.value.type?.base === 'number') return update({ value: Number(value) });
  if (record.value.type?.base === 'integer') return update({ value: Number.parseInt(value, 10) });
  if (record.value.type?.base === 'boolean') return update({ value: value === true || value === 'true' });
  if (record.value.type?.shape !== 'item' || record.value.type?.base === 'json') {
    try {
      update({ value: JSON.parse(value) });
    } catch {
      update({ value });
    }
    return;
  }
  update({ value });
}

function normalizeSpecs(items, input) {
  return items.map((item, index) => ({
    id: item.id || item.label || index,
    label: item.label || item.id || String(index),
    base: item.type?.base || 'json',
    role: item.role || 'data',
    required: Boolean(item.required),
    connected: input ? connectedInputs.value.has(item.id) : false,
    typeLabel: formatProcessType(item.type)
  }));
}

function socketHandleId(item) {
  return `${item.role === 'data' ? 'data' : 'control'}:${item.id}`;
}

function socketClass(item, side) {
  return [
    'relative min-w-0 rounded-ui border px-2 py-0.5',
    side === 'left' ? 'pl-3' : 'pr-3 text-right',
    socketTone(item).row
  ];
}

function handleClass(item, side) {
  return [
    side === 'left' ? '!left-0 !-translate-x-1/2' : '!right-0 !translate-x-1/2',
    socketTone(item).handle
  ];
}

function socketTone(item = {}) {
  if (item.role !== 'data') return { row: 'border-content-border bg-content', handle: '!border-orange-500 !bg-orange-500' };
  return ({
    entity: { row: 'border-content-border bg-content', handle: '!border-sky-500 !bg-sky-500' },
    entityRef: { row: 'border-content-border bg-content', handle: '!border-blue-500 !bg-blue-500' },
    block: { row: 'border-content-border bg-content', handle: '!border-cyan-500 !bg-cyan-500' },
    predicate: { row: 'border-content-border bg-content', handle: '!border-amber-600 !bg-amber-600' },
    patch: { row: 'border-content-border bg-content', handle: '!border-fuchsia-500 !bg-fuchsia-500' },
    number: { row: 'border-content-border bg-content', handle: '!border-lime-500 !bg-lime-500' },
    integer: { row: 'border-content-border bg-content', handle: '!border-lime-600 !bg-lime-600' },
    boolean: { row: 'border-content-border bg-content', handle: '!border-amber-500 !bg-amber-500' },
    date: { row: 'border-content-border bg-content', handle: '!border-indigo-500 !bg-indigo-500' },
    dateTime: { row: 'border-content-border bg-content', handle: '!border-indigo-600 !bg-indigo-600' }
  })[item.base] || { row: 'border-content-border bg-content', handle: '!border-emerald-500 !bg-emerald-500' };
}
</script>
