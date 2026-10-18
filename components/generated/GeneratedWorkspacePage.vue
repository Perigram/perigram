<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden">
    <!-- The page content shell: non-flush pages (the organization
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
        @closed="$emit('closed')"
        @refresh="$emit('refresh')"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { resolveGeneratedWorkspacePage } from '~/components/generated/workspace-pages.js';

const props = defineProps({
  page: { type: Object, required: true }
});

defineEmits(['execute-action', 'open-page', 'open-call', 'closed', 'refresh']);

const definition = computed(() => resolveGeneratedWorkspacePage(props.page?.pageId));
const pageProps = computed(() => definition.value?.props?.(props.page) || {});
</script>
