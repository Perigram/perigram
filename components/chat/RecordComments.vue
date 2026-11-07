<template>
  <!-- The record page's trailing comments section (SPEC §22.17): the
       instance thread in a bounded band at the document's foot, its
       conversation fetched only once the band scrolls into view. -->
  <section :class="LAYOUT.labeledBlock">
    <span :class="LAYOUT.sectionTitle">{{ t('uiMapping.comments') }}</span>
    <div
      ref="band"
      class="relative flex h-support-chat min-h-0 flex-col overflow-hidden rounded-panel border border-chrome-border bg-content"
    >
      <!-- The thread remounts with the opened record: every host (routed
           page, pane tab, popup) swaps the record in place through this
           band. -->
      <RecordCommentsThread
        v-if="active"
        :key="`${typeId}:${instanceId}`"
        :type-id="typeId"
        :instance-id="instanceId"
        :name="name"
      />
    </div>
  </section>
</template>

<script setup>
import { defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { LAYOUT } from '#shared/ui-mapping/index.js';

defineProps({
  typeId: { type: String, required: true },
  instanceId: { type: String, required: true },
  name: { type: String, default: '' }
});

// The thread chunk rides visibility: a record opened above the fold never
// loads the chat family.
const RecordCommentsThread = defineAsyncComponent(() => import('./RecordCommentsThread.vue'));

const { t } = useI18n();
const band = ref(null);
const active = ref(false);
let observer = null;

onMounted(() => {
  observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) {
      active.value = true;
      observer?.disconnect();
      observer = null;
    }
  }, { rootMargin: '200px' });
  observer.observe(band.value);
});
onBeforeUnmount(() => observer?.disconnect());
</script>
