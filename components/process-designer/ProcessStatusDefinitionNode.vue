<template>
  <div :class="nodeFrameClass">
    <div class="absolute inset-x-0 top-0 h-1 rounded-t-ui bg-amber-500"></div>
    <div class="flex items-center gap-2">
      <i :class="data.icon || 'pi pi-circle-fill'" class="text-amber-600"></i>
      <div class="min-w-0 flex-1">
        <div class="truncate text-xs font-semibold uppercase text-amber-700">{{ data.statusId || data.refId }}</div>
        <div class="truncate text-xs text-muted-color">{{ data.entityType }}</div>
      </div>
      <Tag v-if="data.color" :value="data.color" size="small" />
    </div>
    <Handle id="status" type="source" :position="Position.Right" class="!right-0 !translate-x-1/2 !border-amber-500 !bg-amber-500" />
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

const nodeFrameClass = computed(() => [
  'relative min-w-56 rounded-ui border bg-content px-2 py-2 pt-3 shadow-card transition-colors',
  props.selected ? 'border-primary ring-2 ring-primary-200' : 'border-content-border'
]);
</script>
