<template>
  <section class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
    <GeneratedPaneHeader
      :tabs="tabs"
      :active-key="selectionKey"
      :closeable="closeable"
      :back="back"
      @back="$emit('back')"
      @refresh="$emit('refresh')"
      @select-tab="$emit('select-tab', $event)"
      @close-tab="$emit('close-tab', $event)"
      @add="$emit('add-tab', $event)"
      @split="orientation => $emit('split', orientation)"
      @close="$emit('close')"
    />
    <GeneratedScreenPane
      v-if="item?.kind === 'screen'"
      :item="item"
      @open-entity="request => $emit('open-entity', request)"
      @refresh="$emit('refresh')"
    />
    <GeneratedWorkspacePage
      v-else-if="item?.kind === 'page'"
      :page="item"
      @execute-action="(action, entry) => $emit('execute-action', action, entry)"
      @open-page="page => $emit('open-page', page)"
      @open-call="request => $emit('open-call', request)"
      @closed="$emit('close-tab', item.key)"
      @refresh="$emit('refresh')"
    />
    <div v-else class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-muted">
      <i class="pi pi-folder-open" aria-hidden="true" />
      <span>{{ $t('project.openSomething') }}</span>
    </div>
  </section>
</template>

<script setup>
// The workspace pane shell: the pane header (the tab strip and pane
// controls) mounts exactly once here, and the body dispatches on the
// selected tab's content kind — compiled screens and registered workspace
// pages. The body components own content only.
import GeneratedPaneHeader from '~/components/generated/GeneratedPaneHeader.vue';
import GeneratedScreenPane from '~/components/generated/GeneratedScreenPane.vue';
import GeneratedWorkspacePage from '~/components/generated/GeneratedWorkspacePage.vue';

defineProps({
  item: { type: Object, default: null },
  tabs: { type: Array, default: () => [] },
  selectionKey: { type: String, default: '' },
  closeable: { type: Boolean, default: false },
  // The pane's navigation history has somewhere to go: renders the Back
  // control at the start of the pane header.
  back: { type: Boolean, default: false }
});

defineEmits(['execute-action', 'open-entity', 'open-page', 'open-call', 'refresh', 'select-tab', 'close-tab', 'add-tab', 'split', 'close', 'back']);
</script>
