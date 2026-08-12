<template>
  <section
    v-if="definition"
    class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-content"
  >
    <header data-pane-header class="flex h-10 shrink-0 items-center gap-1 border-b [border-color:var(--ck-chrome-border)] bg-chrome pr-1 text-[var(--ck-chrome-foreground)]">
      <GeneratedWorkspaceTabs
        :tabs="tabs"
        :available-tabs="availableTabs"
        :dirty-tab-keys="dirtyTabKeys"
        :pane-id="paneId"
        :active-key="page.key"
        @select="$emit('select-tab', $event)"
        @close="$emit('close-tab', $event)"
        @add="$emit('add-tab', $event)"
        @refresh="$emit('refresh')"
        @reorder="$emit('reorder-tab', $event)"
        @move="$emit('move-tab', $event)"
      />
      <GeneratedWorkspacePaneMenu
        :splittable="splittable"
        :closeable="closeable"
        :maximizable="maximizable"
        :maximized="maximized"
        :can-reopen="canReopen"
        @split="$emit('split', $event)"
        @close="$emit('close')"
        @toggle-maximize="$emit('toggle-maximize')"
        @reopen="$emit('reopen')"
      />
    </header>

    <div class="min-h-0 flex-1 overflow-hidden">
      <component
        :is="definition.component"
        v-bind="pageProps"
        @execute-action="(action, entry) => $emit('execute-action', action, entry)"
        @open-page="page => $emit('open-page', page)"
        @refresh="$emit('refresh')"
        @dirty-change="value => $emit('dirty-change', { key: page.key, dirty: value })"
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
  dirtyTabKeys: { type: Array, default: () => [] },
  paneId: { type: String, default: '' },
  closeable: { type: Boolean, default: false },
  splittable: { type: Boolean, default: true },
  maximizable: { type: Boolean, default: true },
  maximized: { type: Boolean, default: false },
  canReopen: { type: Boolean, default: false }
});

defineEmits(['execute-action', 'open-page', 'refresh', 'dirty-change', 'select-tab', 'close-tab', 'add-tab', 'reorder-tab', 'move-tab', 'split', 'close', 'toggle-maximize', 'reopen']);

const definition = computed(() => resolveGeneratedWorkspacePage(props.page?.pageId));
const pageProps = computed(() => definition.value?.props?.(props.page) || {});
</script>
