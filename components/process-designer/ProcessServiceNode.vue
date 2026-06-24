<template>
  <div :class="nodeFrameClass">
    <div class="absolute inset-x-0 top-0 h-1 rounded-t-ui bg-amber-500"></div>
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <div class="flex items-center gap-1">
          <i class="pi pi-cog text-amber-600" aria-hidden="true"></i>
          <strong class="truncate text-sm">{{ data.label || data.commandId || data.refId }}</strong>
        </div>
        <small class="text-muted-color">{{ data.commandId || $t('processDesigner.commandId') }}</small>
      </div>
    </div>

    <div class="relative mt-2 rounded-ui border border-content-border px-2 py-1">
      <Handle id="run-role" type="target" :position="Position.Top" class="!top-0 !-translate-y-1/2 !border-amber-500 !bg-amber-500" />
      <div class="flex min-w-0 flex-wrap items-center gap-1">
        <span class="text-xs text-muted-color">{{ $t('processDesigner.runAccess') }}</span>
        <span v-for="principal in runPrincipalLabels" :key="principal" class="truncate text-xs">
          {{ principal }}
        </span>
      </div>
    </div>

    <div class="mt-2 grid grid-cols-2 gap-2">
      <div class="flex flex-col gap-1">
        <div
          v-for="(input, index) in inputSpecs"
          :key="input.id"
          :class="socketClass(input, 'left')"
        >
          <Handle :id="socketHandleId('input', input, index, inputSpecs)" type="target" :position="Position.Left" :class="handleClass(input, 'left')" />
          <span class="block truncate text-xs">{{ input.label }}</span>
        </div>
      </div>
      <div class="flex flex-col gap-1">
        <div
          v-for="(output, index) in outputSpecs"
          :key="output.id"
          :class="socketClass(output, 'right')"
        >
          <Handle :id="socketHandleId('output', output, index, outputSpecs)" type="source" :position="Position.Right" :class="handleClass(output, 'right')" />
          <span class="block truncate text-xs">{{ output.label }}</span>
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
  'relative min-w-72 rounded-ui border bg-content px-2 py-2 pt-3 shadow-card transition-colors',
  props.selected ? 'border-primary ring-2 ring-primary-200' : 'border-content-border'
]);
const inputSpecs = computed(() => normalizeSpecs(props.data.inputSpecs || props.data.inputLabels || []));
const outputSpecs = computed(() => normalizeSpecs(props.data.outputSpecs || props.data.outputLabels || []));
const runPrincipalLabels = computed(() => props.data.runPrincipalLabels || []);

function normalizeSpecs(items = []) {
  return items.map((item, index) => {
    if (typeof item === 'string') return { id: `${item}-${index}`, label: item, kind: 'data' };
    return {
      id: item.id || item.label || index,
      label: item.label || item.entityType || item.id,
      kind: item.kind || 'data'
    };
  });
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
    entity: { row: 'border-sky-300 bg-sky-50/60', handle: '!border-sky-500 !bg-sky-500' },
    data: { row: 'border-emerald-300 bg-emerald-50/60', handle: '!border-emerald-500 !bg-emerald-500' },
    attachment: { row: 'border-orange-300 bg-orange-50/60', handle: '!border-orange-500 !bg-orange-500' },
    task: { row: 'border-slate-300 bg-slate-50/60', handle: '!border-slate-500 !bg-slate-500' }
  })[item.kind] || { row: 'border-content-border', handle: '!border-amber-500 !bg-amber-500' };
}
</script>
