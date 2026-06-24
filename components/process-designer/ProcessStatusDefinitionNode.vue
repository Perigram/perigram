<template>
  <div :class="nodeFrameClass">
    <div class="absolute inset-x-0 top-0 h-1 rounded-t-ui" :style="{ backgroundColor: toneColor }"></div>
    <div class="flex min-w-0 items-center">
      <Tag
        :severity="data.severity || 'secondary'"
        :value="displayValue"
        :icon="data.icon || 'pi pi-circle-fill'"
        size="small"
        class="max-w-full"
      />
    </div>
    <Handle id="status" type="source" :position="Position.Right" class="!right-0 !translate-x-1/2" :style="{ borderColor: toneColor, backgroundColor: toneColor }" />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import Tag from 'primevue/tag';

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  selected: { type: Boolean, default: false }
});

const toneColor = computed(() => ({
  success: 'var(--p-green-500)',
  info: 'var(--p-blue-500)',
  warn: 'var(--p-amber-500)',
  warning: 'var(--p-amber-500)',
  danger: 'var(--p-red-500)',
  error: 'var(--p-red-500)',
  secondary: 'var(--p-surface-500)',
  contrast: 'var(--p-surface-700)'
})[props.data.severity || props.data.color] || 'var(--p-amber-500)');
const displayValue = computed(() => {
  const statusId = props.data.statusId || props.data.refId || 'STATUS';
  const label = String(props.data.label || '').trim();
  if (!label || label === statusId) return statusId;
  return label;
});
const nodeFrameClass = computed(() => [
  'relative min-w-56 rounded-ui border bg-content px-2 py-2 pt-3 shadow-card transition-colors',
  props.selected ? 'border-primary ring-2 ring-primary-200' : 'border-content-border'
]);
</script>
