<template>
  <div :class="frameClass">
    <div class="absolute inset-x-0 top-0 h-0.5 rounded-t-ui" :class="scope === 'system' ? 'bg-surface-border' : 'bg-primary'" />
    <div class="flex items-center gap-1.5 border-b border-content-border pb-1.5">
      <i :class="classIcon" aria-hidden="true" />
      <strong class="min-w-0 flex-1 truncate text-label">{{ label }}</strong>
      <Tag :value="classOf" severity="secondary" />
    </div>
    <div class="mt-1.5 flex flex-wrap items-center gap-1">
      <Tag v-if="scope === 'system'" :value="`v${version}`" severity="contrast" />
      <Tag v-if="payload" :value="payload.mime" severity="info" />
      <span v-if="fieldCount" class="text-supporting text-muted">{{ fieldCount }} fields</span>
      <span v-if="stateCount" class="text-supporting text-muted">· {{ stateCount }} states</span>
    </div>
    <Handle type="target" :position="Position.Left" />
    <Handle type="source" :position="Position.Right" />
  </div>
</template>

<script setup>
// Type declaration node (SPEC §20/§21 slice B): declares/children wires
// attach here; fields and states wire into it.
import { computed } from 'vue';
import Tag from 'primevue/tag';
import { Handle, Position } from '@vue-flow/core';

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  selected: { type: Boolean, default: false }
});

const label = computed(() => props.data.label || props.data.typeId || 'type');
const classOf = computed(() => props.data.class || 'file');
const scope = computed(() => props.data.scope || 'org');
const version = computed(() => props.data.version || 1);
const payload = computed(() => props.data.payload || null);
const fieldCount = computed(() => Number(props.data.fieldCount) || 0);
const stateCount = computed(() => Number(props.data.stateCount) || 0);
const classIcon = computed(() => ({
  file: 'pi pi-file',
  item: 'pi pi-box',
  group: 'pi pi-folder',
  process: 'pi pi-cog'
}[classOf.value] || 'pi pi-database'));

const frameClass = computed(() => [
  'relative w-60 rounded-ui border bg-content p-2.5 pt-3 shadow-card transition-colors',
  props.selected ? 'border-primary' : 'border-content-border'
]);
</script>
