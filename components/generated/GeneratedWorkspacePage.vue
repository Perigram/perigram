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
         stage, self-padding directory surface) own their own shell. -->
    <div :class="definition.flush ? 'min-h-0 flex-1 overflow-hidden' : 'min-h-0 flex-1 overflow-auto p-4'">
      <component
        :is="definition.component"
        v-bind="pageProps"
        @execute-action="(action, entry) => $emit('execute-action', action, entry)"
        @open-page="page => $emit('open-page', page)"
        @open-call="request => $emit('open-call', request)"
        @closed="$emit('close-tab', page.key)"
        @refresh="$emit('refresh')"
      />
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import GeneratedPaneHeader from '~/components/generated/GeneratedPaneHeader.vue';
import { resolveGeneratedWorkspacePage } from '~/components/generated/workspace-pages.js';

const props = defineProps({
  page: { type: Object, required: true },
  tabs: { type: Array, default: () => [] },
  closeable: { type: Boolean, default: false },
  splittable: { type: Boolean, default: true },
  back: { type: Boolean, default: false }
});

defineEmits(['execute-action', 'open-page', 'open-call', 'refresh', 'select-tab', 'close-tab', 'add-tab', 'split', 'close', 'back']);

const definition = computed(() => resolveGeneratedWorkspacePage(props.page?.pageId));
const pageProps = computed(() => definition.value?.props?.(props.page) || {});
</script>
