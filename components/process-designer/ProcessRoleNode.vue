<template>
  <div class="min-w-48 rounded-ui border border-content-border bg-content px-3 py-2 shadow-card">
    <div class="flex items-center gap-2">
      <i class="pi pi-shield text-primary" aria-hidden="true"></i>
      <strong class="truncate">{{ data.label || data.refId }}</strong>
    </div>
    <small class="text-muted-color">{{ $t('processDesigner.role') }}</small>
  </div>
</template>

<script setup>
defineProps({ data: { type: Object, default: () => ({}) } });
</script>
