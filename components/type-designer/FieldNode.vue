<template>
  <div :class="frameClass">
    <div class="flex items-center gap-1.5">
      <i class="pi pi-angle-right text-muted" aria-hidden="true" />
      <InputText
        :model-value="name"
        size="small"
        class="min-w-0 flex-1"
        :placeholder="'field'"
        @update:model-value="value => $emit('rename', value)"
        @click.stop
        @dblclick.stop
      />
      <Tag :value="typeLabel" severity="secondary" />
    </div>
    <Handle
      v-if="isRef"
      id="input:targets"
      type="target"
      :position="Position.Left"
      class="!top-1/2 !h-3 !w-3 !-translate-y-1/2 !left-0 !-translate-x-1/2 !rounded-full"
    />
    <Handle id="output:field" type="source" :position="Position.Right" class="!top-1/2 !h-3 !w-3 !-translate-y-1/2 !right-0 !translate-x-1/2 !rounded-full" />
  </div>
</template>

<script setup>
// Field declaration node: wires into its type (declares); a ref field
// also receives its accepted target types through its targets input.
// The descriptor (base, unit, nullability) is authored in the inspector.
import { computed } from 'vue';
import InputText from 'primevue/inputtext';
import Tag from 'primevue/tag';
import { Handle, Position } from '@vue-flow/core';

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  selected: { type: Boolean, default: false }
});

defineEmits(['rename']);

const name = computed(() => props.data.name || '');
const isRef = computed(() => props.data.descriptor?.base === 'ref');
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
