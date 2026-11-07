<template>
  <!-- The record's comments side panel (SPEC §22.17): the bounded
       right-side column the header's comments entry opens inside the
       page host. The thread remounts with the opened record, and the
       panel anchors to the host's bounded column (absolute) or the
       viewport (the routed page, which scrolls with the window). -->
  <aside
    v-if="target"
    :class="[
      viewport
        ? 'fixed top-14 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] md:bottom-0 right-0 z-30'
        : 'absolute inset-y-0 right-0 z-30',
      'flex w-[26rem] max-w-[88vw] flex-col border-l border-chrome-border bg-content shadow-overlay'
    ]"
  >
    <div class="flex shrink-0 items-center justify-between gap-2 border-b border-chrome-border px-3 py-2">
      <span class="text-label text-muted">{{ t('uiMapping.comments') }}</span>
      <Button
        icon="pi pi-times"
        text
        rounded
        size="small"
        severity="secondary"
        :aria-label="t('common.close')"
        @click="$emit('close')"
      />
    </div>
    <div class="min-h-0 flex-1">
      <RecordCommentsThread
        :key="`${target.typeId}:${target.instanceId}`"
        :type-id="target.typeId"
        :instance-id="target.instanceId"
        :name="target.name || ''"
      />
    </div>
  </aside>
</template>

<script setup>
import { defineAsyncComponent } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';

// The comments entry's panel target: `{ typeId, instanceId, name }` —
// the header hands the opened record over and the host toggles its own
// open state.
defineProps({
  target: { type: Object, default: null },
  // The routed page scrolls with the window: its panel anchors to the
  // viewport below the top navbar. Pane and workspace-page hosts render
  // the panel absolutely inside their bounded columns.
  viewport: { type: Boolean, default: false }
});

defineEmits(['close']);

// The thread chunk rides the panel's open state: a page never
// commenting never loads the chat family.
const RecordCommentsThread = defineAsyncComponent(() => import('./RecordCommentsThread.vue'));

const { t } = useI18n();
</script>
