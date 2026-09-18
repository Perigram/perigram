<template>
  <div :class="frameClass">
    <div class="flex items-center gap-1.5">
      <i :class="[initial ? 'pi pi-flag-fill' : terminal ? 'pi pi-circle-fill' : 'pi pi-circle', flagTone]" aria-hidden="true" />
      <strong class="min-w-0 flex-1 truncate text-label">{{ value || 'state' }}</strong>
    </div>
    <Handle type="target" :position="Position.Left" />
    <Handle type="source" :position="Position.Right" />
  </div>
</template>

<script setup>
// State declaration node: wires into its type (declares); state-to-state
// wires are transitions, intents ride the edge (SPEC §7).
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  selected: { type: Boolean, default: false }
});

const value = computed(() => props.data.value || '');
const initial = computed(() => props.data.initial === true);
const terminal = computed(() => props.data.terminal === true);
const flagTone = computed(() => initial.value ? 'text-primary' : terminal.value ? 'text-muted' : 'text-muted');

const frameClass = computed(() => [
  'relative w-40 rounded-ui border bg-content p-2 shadow-card transition-colors',
  props.selected ? 'border-primary' : 'border-content-border'
]);
</script>
