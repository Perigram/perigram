<template>
  <div :class="nodeFrameClass">
    <div class="absolute inset-x-0 top-0 h-0.5 rounded-t-ui" :style="{ backgroundColor: toneColor }"></div>
    <div class="flex items-center gap-1.5 border-b border-content-border pb-1.5">
      <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-ui bg-subtle">
        <i :class="record.icon || 'pi pi-circle-fill'" :style="{ color: toneColor }" aria-hidden="true"></i>
      </span>
      <strong class="min-w-0 flex-1 truncate text-label">{{ record.label || record.statusId || $t('processDesigner.paletteItems.defineStatus') }}</strong>
    </div>

    <div class="nodrag nowheel mt-2 flex flex-col gap-1.5" @mousedown.stop @click.stop>
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

    <div class="relative mt-2 flex min-h-7 min-w-0 flex-col justify-center border-b border-content-border py-1 pr-3 text-right" :title="$t('processDesigner.socketLabels.status')">
      <Handle
        id="data:status"
        type="source"
        :position="Position.Right"
        class="!right-0 !top-1/2 !h-3 !w-3 !translate-x-1/2 !-translate-y-1/2 !rounded-full"
        :style="statusHandleStyle"
        :aria-label="$t('processDesigner.socketLabels.status')"
      />
      <span class="block truncate text-supporting">{{ record.label || record.statusId || $t('processDesigner.socketLabels.status') }}</span>
    </div>
  </div>
</template>

<script setup>
  import { computed } from 'vue';
  import { Handle, Position } from '@vue-flow/core';
  import InputText from 'primevue/inputtext';
  import { processSocketHandleStyle } from '~/utils/processDesignerSocketTone.js';

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
  const statusHandleStyle = computed(() => processSocketHandleStyle({ type: { base: 'status' } }));
  const nodeFrameClass = computed(() => [
    'relative w-56 rounded-ui border bg-content p-2.5 pt-3 shadow-card transition-colors',
    props.selected ? 'border-primary' : 'border-content-border'
  ]);

  function update(updates) {
    props.data.onStatusDefinitionUpdate?.(updates);
  }
</script>
