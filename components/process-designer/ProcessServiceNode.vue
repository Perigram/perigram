<template>
  <div class="relative min-w-72 rounded-ui border border-content-border bg-content px-2 py-2 shadow-card">
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <div class="flex items-center gap-1">
          <i class="pi pi-cog text-primary" aria-hidden="true"></i>
          <strong class="truncate text-sm">{{ data.label || data.commandId || data.refId }}</strong>
        </div>
        <small class="text-muted-color">{{ data.commandId || $t('processDesigner.commandId') }}</small>
      </div>
    </div>

    <div class="relative mt-2 rounded-ui border border-content-border px-2 py-1">
      <Handle id="run-role" type="target" :position="Position.Top" class="!top-0 !-translate-y-1/2 !border-amber-500 !bg-amber-500" />
      <div class="flex min-w-0 flex-wrap items-center gap-1">
        <span class="text-xs text-muted-color">{{ $t('processDesigner.runAccess') }}</span>
        <span v-for="principal in runPrincipalLabels" :key="principal" class="truncate text-xs">
          {{ principal }}
        </span>
      </div>
    </div>

    <div class="mt-2 grid grid-cols-2 gap-2">
      <div class="flex flex-col gap-1">
        <div
          v-for="(input, index) in inputSpecs"
          :key="input.id"
          class="relative min-w-0 rounded-ui border border-content-border px-2 py-0.5 pl-3"
        >
          <Handle :id="socketHandleId('input', input, index, inputSpecs)" type="target" :position="Position.Left" class="!left-0 !-translate-x-1/2 !border-amber-500 !bg-amber-500" />
          <div class="min-w-0">
            <span class="block truncate text-xs">{{ input.label }}</span>
            <div v-if="input.detail" class="truncate text-xs text-muted-color">{{ input.detail }}</div>
          </div>
        </div>
      </div>
      <div class="flex flex-col gap-1">
        <div
          v-for="(output, index) in outputSpecs"
          :key="output.id"
          class="relative min-w-0 rounded-ui border border-content-border px-2 py-0.5 pr-3 text-right"
        >
          <Handle :id="socketHandleId('output', output, index, outputSpecs)" type="source" :position="Position.Right" class="!right-0 !translate-x-1/2 !border-emerald-500 !bg-emerald-500" />
          <div class="min-w-0">
            <span class="block truncate text-xs">{{ output.label }}</span>
            <div v-if="output.detail" class="truncate text-xs text-muted-color">{{ output.detail }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';

const props = defineProps({ data: { type: Object, default: () => ({}) } });

const inputSpecs = computed(() => normalizeSpecs(props.data.inputSpecs || props.data.inputLabels || []));
const outputSpecs = computed(() => normalizeSpecs(props.data.outputSpecs || props.data.outputLabels || []));
const runPrincipalLabels = computed(() => props.data.runPrincipalLabels || []);

function normalizeSpecs(items = []) {
  return items.map((item, index) => {
    if (typeof item === 'string') return { id: `${item}-${index}`, label: item, detail: '' };
    return {
      id: item.id || item.label || index,
      label: item.label || item.entityType || item.id,
      detail: item.detail || ''
    };
  });
}

function socketHandleId(kind, item, index, items) {
  if (items.length === 1) return kind;
  return `${kind}:${item.id || index}`;
}
</script>
