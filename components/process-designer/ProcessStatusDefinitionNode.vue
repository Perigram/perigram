<template>
  <div :class="nodeFrameClass">
    <div class="absolute inset-x-0 top-0 h-0.5 rounded-t-ui" :style="{ backgroundColor: toneColor }"></div>
    <div class="flex items-center gap-1.5">
      <i :class="record.icon || 'pi pi-circle-fill'" class="text-xs" :style="{ color: toneColor }" aria-hidden="true"></i>
      <strong class="min-w-0 flex-1 truncate text-xs">{{ $t('processDesigner.paletteItems.defineStatus') }}</strong>
    </div>

    <div class="nodrag nowheel mt-1.5 grid gap-1" @mousedown.stop @click.stop>
      <InputText
        :model-value="record.statusId"
        size="small"
        class="w-full"
        :placeholder="$t('processDesigner.statusId')"
        @update:model-value="value => update({ statusId: value })"
      />
      <InputText
        :model-value="record.label"
        size="small"
        class="w-full"
        :placeholder="$t('common.label')"
        @update:model-value="value => update({ label: value })"
      />
    </div>

    <div class="relative mt-1.5 rounded-ui bg-subtle py-0.5 pl-2 pr-2.5 text-right" :title="$t('processDesigner.socketLabels.status')">
      <Handle
        id="data:status"
        type="source"
        :position="Position.Right"
        class="!right-0 !top-1/2 !h-2.5 !w-2.5 !translate-x-1/2 !-translate-y-1/2 !rounded-full"
        :style="{ backgroundColor: toneColor, borderColor: toneColor }"
        :aria-label="$t('processDesigner.socketLabels.status')"
      />
      <span class="block truncate text-[11px] leading-5">{{ record.label || record.statusId || $t('processDesigner.socketLabels.status') }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import InputText from 'primevue/inputtext';

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  selected: { type: Boolean, default: false }
});

const record = computed(() => props.data.statusDefinitionRecord || props.data);
const toneColor = computed(() => ({
  success: 'var(--ck-status-success)',
  info: 'var(--ck-status-info)',
  warn: 'var(--ck-status-warning)',
  warning: 'var(--ck-status-warning)',
  danger: 'var(--ck-status-danger)',
  secondary: 'var(--ck-status-neutral)'
})[record.value.severity || record.value.color] || 'var(--ck-status-info)');
const nodeFrameClass = computed(() => [
  'relative w-56 rounded-ui border bg-content p-2 pt-2.5 shadow-card transition-colors',
  props.selected ? 'border-primary ring-2 ring-primary-200' : 'border-content-border'
]);

function update(updates) {
  props.data.onStatusDefinitionUpdate?.(updates);
}
</script>
