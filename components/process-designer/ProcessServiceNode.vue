<template>
  <div class="relative min-w-72 rounded-ui border border-amber-300 bg-content px-3 py-3 shadow-card">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <i class="pi pi-cog text-primary" aria-hidden="true"></i>
          <strong class="truncate">{{ data.label || data.commandId || data.refId }}</strong>
        </div>
        <small class="text-muted-color">{{ data.commandId || $t('processDesigner.commandId') }}</small>
      </div>
    </div>

    <div class="relative mt-3 rounded-ui border border-content-border px-2 py-1">
      <Handle id="run-role" type="target" :position="Position.Top" class="!top-0 !-translate-y-1/2 !border-amber-500 !bg-amber-500" />
      <div class="flex min-w-0 flex-wrap items-center gap-1">
        <Tag :value="$t('processDesigner.runAccess')" size="small" severity="warning" />
        <Tag
          v-for="role in runRoleLabels"
          :key="role"
          :value="role"
          size="small"
          severity="secondary"
        />
      </div>
    </div>

    <div class="mt-3 grid grid-cols-2 gap-3">
      <div class="flex flex-col gap-1">
        <div
          v-for="(input, index) in inputSpecs"
          :key="input.id"
          class="relative min-w-0 rounded-ui border border-content-border py-1 pl-3 pr-2"
        >
          <Handle :id="socketHandleId('input', input, index, inputSpecs)" type="target" :position="Position.Left" class="!left-0 !-translate-x-1/2 !border-amber-500 !bg-amber-500" />
          <div class="min-w-0">
            <Tag :value="input.label" size="small" />
            <div v-if="input.detail" class="truncate text-xs text-muted-color">{{ input.detail }}</div>
          </div>
        </div>
      </div>
      <div class="flex flex-col gap-1">
        <div
          v-for="(output, index) in outputSpecs"
          :key="output.id"
          class="relative min-w-0 rounded-ui border border-content-border py-1 pl-2 pr-3 text-right"
        >
          <Handle :id="socketHandleId('output', output, index, outputSpecs)" type="source" :position="Position.Right" class="!right-0 !translate-x-1/2 !border-emerald-500 !bg-emerald-500" />
          <div class="min-w-0">
            <Tag :value="output.label" size="small" severity="success" />
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
import Tag from 'primevue/tag';

const props = defineProps({ data: { type: Object, default: () => ({}) } });

const inputSpecs = computed(() => normalizeSpecs(props.data.inputSpecs || props.data.inputLabels || []));
const outputSpecs = computed(() => normalizeSpecs(props.data.outputSpecs || props.data.outputLabels || []));
const runRoleLabels = computed(() => props.data.runRoleLabels || []);

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
