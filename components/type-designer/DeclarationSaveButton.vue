<template>
  <Button
    icon="pi pi-save"
    :label="$t('common.save')"
    size="small"
    :disabled="!authoring.dirty.value || authoring.saving.value"
    :loading="authoring.saving.value"
    data-testid="declaration-save"
    @click="authoring.save()"
  />
</template>

<script setup>
import Button from 'primevue/button';

// The one save affordance of a surface authoring session: draft PATCH
// through the persistence seam, dirty-gated (SPEC §1).
defineProps({
  authoring: { type: Object, required: true }
});
</script>
