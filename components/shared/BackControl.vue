<template>
  <Button
    :icon="back.icon || 'pi pi-arrow-left'"
    :aria-label="back.label"
    :title="back.label"
    text
    rounded
    severity="secondary"
    size="small"
    class="shrink-0"
    @click="back.command"
  />
</template>

<script setup>
import Button from 'primevue/button';

// The routed-surface back control — the shared usePageBack shape
// (`{ icon, label, command }`).
defineProps({
  back: { type: Object, required: true }
});
</script>
