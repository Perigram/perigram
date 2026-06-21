<template>
  <div class="min-w-48 rounded-ui border border-content-border bg-content px-3 py-2 shadow-card">
    <div class="flex items-center gap-2">
      <Avatar icon="pi pi-user" shape="circle" size="small" />
      <strong class="truncate">{{ data.label || data.userId || data.refId }}</strong>
    </div>
    <small class="text-muted-color">{{ $t('processDesigner.assignment') }}</small>
  </div>
</template>

<script setup>
import Avatar from 'primevue/avatar';

defineProps({ data: { type: Object, default: () => ({}) } });
</script>
