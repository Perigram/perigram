<template>
  <div :class="nodeFrameClass">
    <div class="absolute inset-x-0 top-0 h-1 rounded-t-ui bg-violet-500"></div>
    <div class="flex items-center gap-2">
      <i class="pi pi-code text-violet-600"></i>
      <div class="min-w-0 flex-1">
        <div class="truncate text-xs font-semibold uppercase text-violet-700">{{ data.valueType || 'string' }}</div>
        <div class="truncate text-xs text-muted-color">{{ data.label || data.refId }}</div>
      </div>
    </div>
    <Handle id="value" type="source" :position="Position.Right" class="!right-0 !translate-x-1/2 !border-violet-500 !bg-violet-500" />
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
</script>
