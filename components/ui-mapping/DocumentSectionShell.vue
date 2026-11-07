<template>
  <!-- With a session the section carries its authoring affordances —
       insert above, move up/down, and for custom blocks edit/delete —
       revealed on hover at the section's leading corner. Without a
       session the shell adds nothing: the section renders as the
       document's own markup. -->
  <div v-if="session" :class="spacing.stack" class="group/ck-doc-section relative">
    <div
      class="absolute -top-2 left-0 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover/ck-doc-section:opacity-100 focus-within:opacity-100"
    >
      <OverlayInsertControl :session="session" :at="index" />
      <Button
        icon="pi pi-arrow-up"
        text
        rounded
        size="small"
        severity="secondary"
        :aria-label="t('uiMapping.moveSectionUp')"
        :title="t('uiMapping.moveSectionUp')"
        :disabled="index === 0"
        @click="session.move(sectionKey, -1)"
      />
      <Button
        icon="pi pi-arrow-down"
        text
        rounded
        size="small"
        severity="secondary"
        :aria-label="t('uiMapping.moveSectionDown')"
        :title="t('uiMapping.moveSectionDown')"
        @click="session.move(sectionKey, 1)"
      />
      <template v-if="block">
        <Button
          v-if="block.kind === 'text'"
          icon="pi pi-pencil"
          text
          rounded
          size="small"
          severity="secondary"
          :aria-label="t('common.edit')"
          :title="t('common.edit')"
          @click="session.editBlock(block.id)"
        />
        <Button
          icon="pi pi-trash"
          text
          rounded
          size="small"
          severity="secondary"
          :aria-label="t('common.delete')"
          :title="t('common.delete')"
          @click="session.removeBlock(block.id)"
        />
      </template>
    </div>
    <slot />
  </div>
  <slot v-else />
</template>

<script setup>
// One document section's authoring shell (SPEC §26): declared sections
// reorder; only custom blocks edit and delete.
import { inject } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import OverlayInsertControl from './OverlayInsertControl.vue';

defineProps({
  // The overlay session (composables/useRecordOverlay); null renders the
  // bare section.
  session: { type: Object, default: null },
  sectionKey: { type: String, required: true },
  index: { type: Number, default: 0 },
  // The custom block this section renders, when it is one.
  block: { type: Object, default: null }
});

const spacing = inject('uiMappingSpacing');
const { t } = useI18n();
</script>
