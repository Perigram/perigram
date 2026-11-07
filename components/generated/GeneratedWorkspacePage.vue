<template>
  <section
    v-if="definition"
    class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
  >
    <GeneratedPaneHeader
      :tabs="tabs"
      :active-key="page.key"
      :closeable="closeable"
      :splittable="splittable"
      :back="back"
      @back="$emit('back')"
      @select-tab="$emit('select-tab', $event)"
      @close-tab="$emit('close-tab', $event)"
      @add="$emit('add-tab', $event)"
      @split="orientation => $emit('split', orientation)"
      @close="$emit('close')"
    />

    <!-- The pane's content shell: non-flush pages (the organization
         management surfaces) render inside the padded scroll area every
         other pane surface uses; flush pages (canvas designer, call
         stage, self-padding directory surface) own their own shell. A
         record-bound page opens with the record's lineage chain — the
         page host is the record's header on this mount. -->
    <div :class="definition.flush ? 'min-h-0 flex-1 overflow-hidden' : 'min-h-0 flex-1 overflow-auto p-4'">
      <TraceChain
        v-if="page.entity"
        :entity="page.entity"
        :type-id="page.typeId || ''"
        variant="compact"
        expandable
        :class="definition.flush ? 'px-4 pt-3' : 'pb-2'"
      />
      <!-- Every editor page resolves the same loader component; the page
           key is what gives each tab its own content instance. -->
      <component
        :is="definition.component"
        :key="page.key"
        v-bind="pageProps"
        @open-page="page => $emit('open-page', page)"
        @open-call="request => $emit('open-call', request)"
        @closed="$emit('close-tab', page.key)"
        @refresh="$emit('refresh')"
      />
    </div>
  </section>
</template>

<script setup>
import { computed, provide } from 'vue';
import GeneratedPaneHeader from '~/components/generated/GeneratedPaneHeader.vue';
import TraceChain from '~/components/shared/links/TraceChain.vue';
import { resolveGeneratedWorkspacePage } from '~/components/generated/workspace-pages.js';

const props = defineProps({
  page: { type: Object, required: true },
  tabs: { type: Array, default: () => [] },
  closeable: { type: Boolean, default: false },
  splittable: { type: Boolean, default: true },
  back: { type: Boolean, default: false }
});

provide('workspacePageKey', props.page?.key);

defineEmits(['open-page', 'open-call', 'refresh', 'select-tab', 'close-tab', 'add-tab', 'split', 'close', 'back']);

const definition = computed(() => resolveGeneratedWorkspacePage(props.page?.pageId));
const pageProps = computed(() => definition.value?.props?.(props.page) || {});
</script>
