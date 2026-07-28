<template>
  <div :class="nodeFrameClass">
    <div class="absolute inset-x-0 top-0 h-1 rounded-t-ui bg-violet-500"></div>
    <div class="flex items-center gap-2">
      <i :class="data.icon || 'pi pi-code'" class="text-violet-600"></i>
      <div class="min-w-0 flex-1">
        <div class="truncate text-xs font-semibold uppercase text-violet-700">{{ typeLabel }}</div>
        <div class="truncate text-xs text-muted-color">{{ valueLabel }}</div>
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
const typeLabel = computed(() => `${props.data.valueType || 'string'}${props.data.structure === 'list' ? '[]' : ''}`);
const valueLabel = computed(() => {
  if (props.data.structure === 'list') {
    try {
      const values = Array.isArray(props.data.value) ? props.data.value : JSON.parse(props.data.value || '[]');
      return `[${values.length}]`;
    } catch {
      return '[]';
    }
  }
  if (props.data.value === true) return 'true';
  if (props.data.value === false) return 'false';
  return String(props.data.value ?? props.data.label ?? props.data.refId);
});
</script>
