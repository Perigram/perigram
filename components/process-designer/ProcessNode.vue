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
      <Select
        v-if="operationOptions.length"
        :model-value="record.kind === 'entityRef' ? record.mode : record.operation"
        :options="operationOptions"
        option-label="label"
        option-value="value"
        size="small"
        @update:model-value="value => update(record.kind === 'entityRef' ? { mode: value } : { operation: value })"
      />
      <Select
        v-if="showRelationSelect"
        :model-value="record.relationKey"
        :options="data.processRelationOptions || []"
        option-label="label"
        option-value="value"
        size="small"
        @update:model-value="value => update({ relationKey: value })"
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
      <Select
        v-if="record.kind === 'cast'"
        :model-value="record.valueType"
        :options="data.processValueTypeOptions || []"
        option-label="label"
        option-value="value"
        size="small"
        @update:model-value="value => update({ valueType: value })"
      />
      <InputText
        v-if="record.kind === 'stringOp' && record.operation === 'template'"
        :model-value="record.template"
        size="small"
        @update:model-value="value => update({ template: value })"
      />
    </div>

    <div class="mt-2 grid grid-cols-2 gap-2">
      <div class="flex flex-col gap-1">
        <div v-for="(input, index) in inputSpecs" :key="input.id" :class="socketClass(input, 'left')">
          <Handle :id="socketHandleId('input', input, index, inputSpecs)" type="target" :position="Position.Left" :class="handleClass(input, 'left')" />
          <span class="flex min-w-0 items-center gap-1 text-xs">
            <Badge v-if="input.required && !input.connected" value="!" severity="danger" size="small" />
            <span class="truncate">{{ input.label }}</span>
            <span class="shrink-0 text-[10px] text-muted-color">{{ input.typeLabel }}</span>
          </span>
        </div>
      </div>
      <div class="flex flex-col gap-1">
        <div v-for="(output, index) in outputSpecs" :key="output.id" :class="socketClass(output, 'right')">
          <Handle :id="socketHandleId('output', output, index, outputSpecs)" type="source" :position="Position.Right" :class="handleClass(output, 'right')" />
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
  ['entityQuery', 'entityRef', 'entityCondition', 'entityCompose', 'blockCompose'].includes(record.value.kind)
));
const showRelationSelect = computed(() => record.value.kind === 'entityRef' && record.value.mode === 'related');
const showBlockSelect = computed(() => ['blockCompose', 'entityModify'].includes(record.value.kind) && (props.data.processBlockOptions || []).length);
const hasInlineConfiguration = computed(() => (
  showEntitySelect.value
  || operationOptions.value.length
  || showRelationSelect.value
  || showBlockSelect.value
  || fieldOptions.value.length
  || record.value.kind === 'cast'
  || (record.value.kind === 'stringOp' && record.value.operation === 'template')
));
const nodeFrameClass = computed(() => [
  'relative min-w-64 rounded-ui border bg-content p-2 pt-3 shadow-card transition-colors',
  props.selected ? 'border-primary ring-2 ring-primary-200' : 'border-content-border'
]);
const accent = computed(() => {
  if (['entityQuery', 'entityRef', 'entityDecompose', 'entityField', 'entityFilter', 'entitySelect', 'entityCompose', 'entityModify'].includes(record.value.kind)) {
    return { stripe: 'bg-cyan-500', icon: 'text-cyan-600', title: 'text-cyan-700' };
  }
  if (['blockRead', 'blockCompose', 'blockModify'].includes(record.value.kind)) {
    return { stripe: 'bg-sky-500', icon: 'text-sky-600', title: 'text-sky-700' };
  }
  if (['compare', 'logic', 'entityCondition', 'predicateLogic'].includes(record.value.kind)) {
    return { stripe: 'bg-amber-500', icon: 'text-amber-600', title: 'text-amber-700' };
  }
  return { stripe: 'bg-violet-500', icon: 'text-violet-600', title: 'text-violet-700' };
});

function update(updates) {
  props.data.onProcessNodeUpdate?.(updates);
}

function normalizeSpecs(items, input) {
  return items.map((item, index) => ({
    id: item.id || item.label || index,
    label: item.label || item.entityType || item.block || item.kind || item.id || String(index),
    kind: item.kind || 'data',
    required: Boolean(item.required),
    connected: input ? connectedInputs.value.has(item.id) : false,
    typeLabel: formatPortKind(item.kind || 'data')
  }));
}

function formatPortKind(kind = 'data') {
  if (kind === 'entity_list') return 'Entity[]';
  if (kind === 'block_list') return 'Block[]';
  if (kind.endsWith('_list')) return `${capitalize(kind.slice(0, -5))}[]`;
  return capitalize(kind);
}

function capitalize(value) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : '';
}

function socketHandleId(kind, item, index, items) {
  if (items.length === 1) return kind;
  return `${kind}:${item.id || index}`;
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
  return ({
    entity: { row: 'border-content-border bg-content', handle: '!border-sky-500 !bg-sky-500' },
    entity_list: { row: 'border-content-border bg-content', handle: '!border-blue-500 !bg-blue-500' },
    block: { row: 'border-content-border bg-content', handle: '!border-cyan-500 !bg-cyan-500' },
    block_list: { row: 'border-content-border bg-content', handle: '!border-cyan-600 !bg-cyan-600' },
    predicate: { row: 'border-content-border bg-content', handle: '!border-amber-600 !bg-amber-600' },
    data: { row: 'border-content-border bg-content', handle: '!border-emerald-500 !bg-emerald-500' },
    string: { row: 'border-content-border bg-content', handle: '!border-emerald-500 !bg-emerald-500' },
    number: { row: 'border-content-border bg-content', handle: '!border-lime-500 !bg-lime-500' },
    boolean: { row: 'border-content-border bg-content', handle: '!border-amber-500 !bg-amber-500' },
    json: { row: 'border-content-border bg-content', handle: '!border-teal-500 !bg-teal-500' },
    date: { row: 'border-content-border bg-content', handle: '!border-indigo-500 !bg-indigo-500' },
    string_list: { row: 'border-content-border bg-content', handle: '!border-emerald-600 !bg-emerald-600' },
    number_list: { row: 'border-content-border bg-content', handle: '!border-lime-600 !bg-lime-600' },
    boolean_list: { row: 'border-content-border bg-content', handle: '!border-amber-600 !bg-amber-600' },
    json_list: { row: 'border-content-border bg-content', handle: '!border-teal-600 !bg-teal-600' },
    date_list: { row: 'border-content-border bg-content', handle: '!border-indigo-600 !bg-indigo-600' },
    list: { row: 'border-content-border bg-content', handle: '!border-slate-500 !bg-slate-500' },
    status: { row: 'border-content-border bg-content', handle: '!border-orange-500 !bg-orange-500' },
    event: { row: 'border-content-border bg-content', handle: '!border-violet-500 !bg-violet-500' }
  })[item.kind] || { row: 'border-content-border', handle: '!border-emerald-500 !bg-emerald-500' };
}
</script>
