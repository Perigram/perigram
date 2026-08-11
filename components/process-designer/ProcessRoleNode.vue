<template>
  <div class="relative min-w-60 rounded-ui border border-content-border bg-content px-3 py-3 shadow-card">
    <Handle id="assignment" type="target" :position="Position.Left" :style="processSocketHandleStyle({ type: { base: 'entityRef' } })" />
    <Handle id="access" type="source" :position="Position.Right" :style="processSocketHandleStyle({ type: { base: 'entityRef' } })" />
    <Handle id="service" type="source" :position="Position.Bottom" :style="processSocketHandleStyle({ kind: 'event' })" />

    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <i class="pi pi-shield text-[var(--ck-primary-ink)]" aria-hidden="true"></i>
          <strong class="truncate">{{ data.label || data.refId }}</strong>
        </div>
        <small class="text-muted-color">{{ data.kind || $t('processDesigner.role') }}</small>
      </div>
      <Badge :value="data.grantCount || 0" severity="success" />
    </div>

    <div class="mt-3 flex flex-wrap gap-2">
      <Tag :value="$t('processDesigner.assignmentEdge')" size="small" severity="info" />
      <Tag :value="$t('processDesigner.accessEdge')" size="small" severity="success" />
      <Tag :value="$t('processDesigner.serviceEdge')" size="small" severity="warning" />
    </div>
  </div>
</template>

<script setup>
import { Handle, Position } from '@vue-flow/core';
import Badge from 'primevue/badge';
import Tag from 'primevue/tag';
import { processSocketHandleStyle } from '~/utils/processDesignerSocketTone.js';

defineProps({ data: { type: Object, default: () => ({}) } });
</script>
