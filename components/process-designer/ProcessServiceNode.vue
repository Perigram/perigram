<template>
  <div :class="nodeFrameClass">
    <div class="absolute inset-x-0 top-0 h-1 rounded-t-ui bg-signal-decision"></div>
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <div class="flex items-center gap-1">
          <i class="pi pi-cog text-signal-decision" aria-hidden="true"></i>
          <strong class="truncate text-label">{{ data.label || data.commandId || data.refId }}</strong>
        </div>
        <small class="text-muted-color">{{ data.commandId || $t('processDesigner.commandId') }}</small>
      </div>
    </div>

    <div class="relative mt-2 rounded-ui border border-content-border px-2 py-1">
      <Handle id="run-role" type="target" :position="Position.Top" class="!top-0 !-translate-y-1/2" :style="handleStyle({ kind: 'event' })" />
      <div class="flex min-w-0 flex-wrap items-center gap-1">
        <span class="text-muted-color text-supporting">{{ $t('processDesigner.runAccess') }}</span>
        <span v-for="principal in runPrincipalLabels" :key="principal" class="truncate text-supporting">
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
          <Handle :id="socketHandleId('input', input, index, inputSpecs)" type="target" :position="Position.Left" :class="handleClass(input, 'left')" :style="handleStyle(input)" />
          <span class="block truncate text-supporting">{{ input.label }}</span>
        </div>
      </div>
      <div class="flex flex-col gap-1">
        <div
          v-for="(output, index) in outputSpecs"
          :key="output.id"
          :class="socketClass(output, 'right')"
        >
          <Handle :id="socketHandleId('output', output, index, outputSpecs)" type="source" :position="Position.Right" :class="handleClass(output, 'right')" :style="handleStyle(output)" />
          <span class="block truncate text-supporting">{{ output.label }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import { processSocketHandleStyle } from '~/utils/processDesignerSocketTone.js';

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  selected: { type: Boolean, default: false }
});

const nodeFrameClass = computed(() => [
  'relative min-w-72 rounded-ui border bg-content px-2 py-2 pt-3 shadow-card transition-colors',
  props.selected ? 'border-primary' : 'border-content-border'
]);
const inputSpecs = computed(() => normalizeSpecs(props.data.inputSpecs || props.data.inputLabels || []));
const outputSpecs = computed(() => normalizeSpecs(props.data.outputSpecs || props.data.outputLabels || []));
const runPrincipalLabels = computed(() => props.data.runPrincipalLabels || []);

function normalizeSpecs(items = []) {
  return items.map((item, index) => {
    if (typeof item === 'string') return { id: `${item}-${index}`, label: item, kind: 'data' };
    return {
      ...item,
      id: item.id || item.label || index,
      label: item.label || item.entityType || item.id,
      kind: item.kind || item.type?.base || 'data'
    };
  });
}

function socketHandleId(kind, item, index, items) {
  if (items.length === 1) return kind;
  return `${kind}:${item.id || index}`;
}

function socketClass(item, side) {
  return [
    'relative min-w-0 border-b border-content-border py-0.5',
    side === 'left' ? 'pl-3' : 'pr-3 text-right',
  ];
}

function handleClass(item, side) {
  return [
    side === 'left' ? '!left-0 !-translate-x-1/2' : '!right-0 !translate-x-1/2'
  ];
}

function handleStyle(item) {
  return processSocketHandleStyle(item);
}
</script>
