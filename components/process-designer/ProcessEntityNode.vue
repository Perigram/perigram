<template>
  <div class="relative min-w-72 rounded-ui border border-sky-300 bg-content px-3 py-3 shadow-card">
    <Handle id="access" type="target" :position="Position.Left" class="!border-sky-500 !bg-sky-500" />
    <Handle id="service-input" type="source" :position="Position.Right" class="!border-amber-500 !bg-amber-500" />
    <Handle id="socket-source" type="source" :position="Position.Bottom" class="!border-violet-500 !bg-violet-500" />

    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <i class="pi pi-box text-primary" aria-hidden="true"></i>
          <strong class="truncate">{{ data.label || data.entityType || data.refId }}</strong>
        </div>
        <small class="text-muted-color">{{ data.entityType || $t('processDesigner.entityType') }}</small>
      </div>
      <Badge :value="data.fieldCount || 0" severity="info" />
    </div>

    <div class="mt-3 grid grid-cols-2 gap-2">
      <Tag :value="data.lifecycleMode || $t('processDesigner.defaultCreated')" size="small" />
      <Tag :value="$t('processDesigner.fieldsCount', { count: data.fieldCount || 0 })" size="small" severity="info" />
    </div>
  </div>
</template>

<script setup>
import { Handle, Position } from '@vue-flow/core';
import Badge from 'primevue/badge';
import Tag from 'primevue/tag';

defineProps({ data: { type: Object, default: () => ({}) } });
</script>
