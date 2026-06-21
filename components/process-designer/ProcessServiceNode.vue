<template>
  <div class="relative min-w-72 rounded-ui border border-amber-300 bg-content px-3 py-3 shadow-card">
    <Handle id="run-role" type="target" :position="Position.Top" class="!border-amber-500 !bg-amber-500" />
    <Handle id="input" type="target" :position="Position.Left" class="!border-amber-500 !bg-amber-500" />
    <Handle id="output" type="source" :position="Position.Right" class="!border-emerald-500 !bg-emerald-500" />

    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <i class="pi pi-cog text-primary" aria-hidden="true"></i>
          <strong class="truncate">{{ data.label || data.commandId || data.refId }}</strong>
        </div>
        <small class="text-muted-color">{{ data.commandId || $t('processDesigner.commandId') }}</small>
      </div>
      <Badge :value="data.roleCount || 0" severity="warning" />
    </div>

    <div class="mt-3 grid grid-cols-1 gap-2">
      <div v-if="inputLabels.length" class="flex flex-wrap gap-1">
        <Tag v-for="input in inputLabels" :key="input" :value="input" size="small" />
      </div>
      <div v-if="outputLabels.length" class="flex flex-wrap gap-1">
        <Tag v-for="output in outputLabels" :key="output" :value="output" size="small" severity="success" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import Badge from 'primevue/badge';
import Tag from 'primevue/tag';

const props = defineProps({ data: { type: Object, default: () => ({}) } });

const inputLabels = computed(() => props.data.inputLabels || []);
const outputLabels = computed(() => props.data.outputLabels || []);
</script>
