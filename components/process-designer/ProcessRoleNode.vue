<template>
  <div class="relative min-w-60 rounded-ui border border-signal-data bg-content px-3 py-3 shadow-card">
    <Handle id="assignment" type="target" :position="Position.Left" class="!border-signal-data !bg-signal-data" />
    <Handle id="access" type="source" :position="Position.Right" class="!border-signal-data !bg-signal-data" />
    <Handle id="service" type="source" :position="Position.Bottom" class="!border-signal-decision !bg-signal-decision" />

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

defineProps({ data: { type: Object, default: () => ({}) } });
</script>
