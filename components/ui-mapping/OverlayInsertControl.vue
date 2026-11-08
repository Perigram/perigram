<template>
  <span class="flex items-center gap-1">
    <Button
      icon="pi pi-plus"
      text
      rounded
      size="small"
      severity="secondary"
      class="h-6 w-6"
      :aria-label="t('uiMapping.addBlock')"
      :title="t('uiMapping.addBlock')"
      :disabled="!session.loaded"
      @click="session.insertText(at)"
    />
    <Button
      icon="pi pi-objects-column"
      text
      rounded
      size="small"
      severity="secondary"
      class="h-6 w-6"
      :aria-label="t('uiMapping.addViewBlock')"
      :title="t('uiMapping.addViewBlock')"
      :disabled="!session.loaded"
      @click="session.openViewPicker(at)"
    />
  </span>
</template>

<script setup>
// The gutter's insert pair (SPEC §26): the plus creates a focused text
// block at this position in one gesture; the columns control embeds a
// saved view.
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';

const props = defineProps({
  session: { type: Object, required: true },
  // The flow index the new block takes.
  at: { type: Number, default: 0 }
});

const { t } = useI18n();
</script>
