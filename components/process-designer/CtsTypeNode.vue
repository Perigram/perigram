<template>
  <div :class="frameClass">
    <Handle type="target" :position="Position.Left" />
    <Handle type="source" :position="Position.Right" />
    <div class="absolute inset-x-0 top-0 h-0.5 rounded-t-ui" :style="{ backgroundColor: 'var(--ck-status-neutral)' }"></div>
    <div class="flex items-center gap-1.5 border-b border-content-border pb-1.5">
      <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-ui bg-subtle">
        <i :class="type?.icon || 'pi pi-database'" aria-hidden="true"></i>
      </span>
      <strong class="min-w-0 flex-1 truncate text-label">{{ type?.label || typeId || 'type' }}</strong>
      <Tag :value="type?.class || ''" severity="secondary" />
    </div>
    <div class="mt-2 flex flex-col gap-1">
      <span v-if="type?.states" class="text-supporting text-muted">{{ type.states }}</span>
      <span v-else class="text-supporting text-muted">select a type in the inspector; wire into nodes to bind</span>
    </div>
  </div>
</template>

<script setup>
// Type reference anchor (SPEC §20/§4): a canvas node for one registry type.
// It owns no records — its wires carry type bindings into species records
// (role: 'type' edges are gestures, the binding lands in the record's type).
import { computed } from 'vue';
import Tag from 'primevue/tag';
import { Handle, Position } from '@vue-flow/core';

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  selected: { type: Boolean, default: false }
});

const typeId = computed(() => props.data?.typeId || '');
const type = computed(() => props.data?.type || null);

const frameClass = computed(() => [
  'relative w-56 rounded-ui border bg-content p-2.5 pt-3 shadow-card transition-colors',
  props.selected ? 'border-primary' : 'border-content-border'
]);
</script>
