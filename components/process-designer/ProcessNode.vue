<template>
  <div :class="nodeFrameClass">
    <div :class="['absolute inset-x-0 top-0 h-1 rounded-t-ui', accent.stripe]"></div>
    <div class="flex items-center gap-2">
      <i :class="[data.icon || 'pi pi-sitemap', accent.icon]"></i>
      <div class="min-w-0 flex-1">
        <div :class="['truncate text-xs font-semibold uppercase', accent.title]">{{ data.kindLabel || data.kind || 'node' }}</div>
        <div class="truncate text-xs text-muted-color">{{ data.summary || data.label || data.refId }}</div>
      </div>
    </div>

    <div class="mt-2 grid grid-cols-2 gap-2">
      <div class="flex flex-col gap-1">
        <div v-for="(input, index) in inputSpecs" :key="input.id" :class="socketClass(input, 'left')">
          <Handle :id="socketHandleId('input', input, index, inputSpecs)" type="target" :position="Position.Left" :class="handleClass(input, 'left')" />
          <span class="flex min-w-0 items-center gap-1 text-xs">
            <span class="truncate">{{ input.label }}</span>
            <span class="shrink-0 text-[10px] uppercase text-muted-color">{{ input.typeLabel }}</span>
          </span>
        </div>
      </div>
      <div class="flex flex-col gap-1">
        <div v-for="(output, index) in outputSpecs" :key="output.id" :class="socketClass(output, 'right')">
          <Handle :id="socketHandleId('output', output, index, outputSpecs)" type="source" :position="Position.Right" :class="handleClass(output, 'right')" />
          <span class="flex min-w-0 items-center justify-end gap-1 text-xs">
            <span class="shrink-0 text-[10px] uppercase text-muted-color">{{ output.typeLabel }}</span>
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

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  selected: { type: Boolean, default: false }
});

const nodeFrameClass = computed(() => [
  'relative min-w-56 rounded-ui border bg-content px-2 py-2 pt-3 shadow-card transition-colors',
  props.selected ? 'border-primary ring-2 ring-primary-200' : 'border-content-border'
]);
const inputSpecs = computed(() => normalizeSpecs(props.data.inputSpecs || []));
const outputSpecs = computed(() => normalizeSpecs(props.data.outputSpecs || []));
const accent = computed(() => {
  if (['entityQuery', 'entityRef', 'entityDecompose', 'entityField', 'entityFilter', 'entitySelect', 'entityCompose', 'entityModify'].includes(props.data.kind)) {
    return { stripe: 'bg-cyan-500', icon: 'text-cyan-600', title: 'text-cyan-700' };
  }
  if (['blockRead', 'blockCompose', 'blockModify'].includes(props.data.kind)) {
    return { stripe: 'bg-sky-500', icon: 'text-sky-600', title: 'text-sky-700' };
  }
  if (['compare', 'logic'].includes(props.data.kind)) {
    return { stripe: 'bg-amber-500', icon: 'text-amber-600', title: 'text-amber-700' };
  }
  return { stripe: 'bg-violet-500', icon: 'text-violet-600', title: 'text-violet-700' };
});

function normalizeSpecs(items = []) {
  return items.map((item, index) => ({
    id: item.id || item.label || index,
    label: item.label || item.entityType || item.block || item.kind || item.id || String(index),
    kind: item.kind || 'data',
    typeLabel: formatPortKind(item.kind || 'data')
  }));
}

function formatPortKind(kind = 'data') {
  if (kind === 'entity_list') return 'entity[]';
  if (kind === 'block_list') return 'block[]';
  return kind.endsWith('_list') ? `${kind.slice(0, -5)}[]` : kind;
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
