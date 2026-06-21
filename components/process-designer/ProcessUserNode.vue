<template>
  <div class="relative min-w-60 rounded-ui border border-slate-300 bg-content px-3 py-3 shadow-card">
    <Handle id="assignment" type="source" :position="Position.Right" class="!border-slate-500 !bg-slate-500" />

    <div class="flex items-start justify-between gap-3">
      <div class="flex min-w-0 items-center gap-2">
        <Avatar icon="pi pi-user" shape="circle" size="small" />
        <div class="min-w-0">
          <strong class="block truncate">{{ data.label || data.userId || data.refId }}</strong>
          <small class="text-muted-color">{{ $t('processDesigner.assignment') }}</small>
        </div>
      </div>
      <Badge :value="data.roleCount || 0" severity="info" />
    </div>
  </div>
</template>

<script setup>
import { Handle, Position } from '@vue-flow/core';
import Avatar from 'primevue/avatar';
import Badge from 'primevue/badge';

defineProps({ data: { type: Object, default: () => ({}) } });
</script>
