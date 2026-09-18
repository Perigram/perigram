<template>
  <div :class="frameClass">
    <div class="flex items-center gap-1.5">
      <i class="pi pi-angle-right text-muted" aria-hidden="true" />
      <strong class="min-w-0 flex-1 truncate text-label">{{ name || 'field' }}</strong>
      <Tag :value="typeLabel" severity="secondary" />
    </div>
    <Handle type="source" :position="Position.Right" />
  </div>
</template>

<script setup>
// Field declaration node: wires into its type (declares). The descriptor
// (base, unit, ref targets, nullability) is authored in the inspector.
import { computed } from 'vue';
import Tag from 'primevue/tag';
import { Handle, Position } from '@vue-flow/core';

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  selected: { type: Boolean, default: false }
});

const name = computed(() => props.data.name || '');
const typeLabel = computed(() => {
  const descriptor = props.data.descriptor || {};
  if (descriptor.base === 'quantity') return `${descriptor.unit || '?'}`;
  if (descriptor.base === 'ref') return `Ref(${(descriptor.accepts || []).join('|')})`;
  if (descriptor.nullable) return `${descriptor.base}?`;
  return descriptor.base || 'field';
});

const frameClass = computed(() => [
  'relative w-48 rounded-ui border bg-content p-2 shadow-card transition-colors',
  props.selected ? 'border-primary' : 'border-content-border'
]);
</script>
