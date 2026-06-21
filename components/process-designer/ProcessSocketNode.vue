<template>
  <div class="relative min-w-72 rounded-ui border border-violet-300 bg-content px-3 py-3 shadow-card">
    <Handle id="entity-projection" type="target" :position="Position.Left" class="!border-violet-500 !bg-violet-500" />
    <Handle id="transfer" type="source" :position="Position.Right" class="!border-violet-500 !bg-violet-500" />
    <Handle id="receive-role" type="target" :position="Position.Top" class="!border-violet-500 !bg-violet-500" />

    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <i class="pi pi-share-alt text-primary" aria-hidden="true"></i>
          <strong class="truncate">{{ data.label || data.entityType || data.refId }}</strong>
        </div>
        <small class="text-muted-color">{{ data.entityType || $t('processDesigner.entityType') }}</small>
      </div>
      <Badge :value="data.fieldCount || 0" severity="secondary" />
    </div>

    <div class="mt-3 flex flex-wrap gap-2">
      <Tag :value="data.direction || $t('processDesigner.socket')" size="small" severity="secondary" />
      <Tag :value="$t('processDesigner.projectedCount', { count: data.fieldCount || 0 })" size="small" />
    </div>
  </div>
</template>

<script setup>
import { Handle, Position } from '@vue-flow/core';
import Badge from 'primevue/badge';
import Tag from 'primevue/tag';

defineProps({ data: { type: Object, default: () => ({}) } });
</script>
