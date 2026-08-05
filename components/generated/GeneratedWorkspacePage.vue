<template>
  <section
    v-if="definition"
    class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-content"
  >
    <header data-pane-header class="flex h-10 shrink-0 items-center gap-1 border-b [border-color:var(--ck-chrome-border)] bg-chrome pr-1 text-[var(--ck-chrome-foreground)]">
      <GeneratedWorkspaceTabs
        :tabs="tabs"
        :available-tabs="availableTabs"
        :active-key="page.key"
        @select="$emit('select-tab', $event)"
        @close="$emit('close-tab', $event)"
        @add="$emit('add-tab', $event)"
        @refresh="$emit('refresh')"
      />
      <GeneratedWorkspacePaneMenu
        :splittable="splittable"
        :closeable="closeable"
        @split="$emit('split', $event)"
        @close="$emit('close')"
      />
    </header>

    <div class="min-h-0 flex-1 overflow-hidden">
      <component
        :is="definition.component"
        v-bind="pageProps"
        @execute-action="(action, entry) => $emit('execute-action', action, entry)"
        @open-page="page => $emit('open-page', page)"
        @refresh="$emit('refresh')"
      />
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import GeneratedWorkspaceTabs from '~/components/generated/GeneratedWorkspaceTabs.vue';
import GeneratedWorkspacePaneMenu from '~/components/generated/GeneratedWorkspacePaneMenu.vue';
import { resolveGeneratedWorkspacePage } from '~/components/generated/workspace-pages.js';

const props = defineProps({
  page: { type: Object, required: true },
  tabs: { type: Array, default: () => [] },
  availableTabs: { type: Array, default: () => [] },
  closeable: { type: Boolean, default: false },
  splittable: { type: Boolean, default: true }
});

defineEmits(['execute-action', 'open-page', 'refresh', 'select-tab', 'close-tab', 'add-tab', 'split', 'close']);

const definition = computed(() => resolveGeneratedWorkspacePage(props.page?.pageId));
const pageProps = computed(() => definition.value?.props?.(props.page) || {});
</script>
