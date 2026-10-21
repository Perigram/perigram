<template>
  <!-- Opened screens (type screens and instance-bound detail screens) and
       registered workspace pages: every pane tab is a screen or page
       reference. -->
  <GeneratedScreenPane
    v-if="item?.kind === 'screen'"
    :item="item"
    :tabs="tabs"
    :closeable="closeable"
    :splittable="splittable"
    :back="back"
    @back="$emit('back')"
    @refresh="$emit('refresh')"
    @open-entity="request => $emit('open-entity', request)"
    @select-tab="$emit('select-tab', $event)"
    @close-tab="$emit('close-tab', $event)"
    @add-tab="$emit('add-tab', $event)"
    @split="orientation => $emit('split', orientation)"
    @close="$emit('close')"
  />
  <GeneratedWorkspacePage
    v-else-if="item?.kind === 'page'"
    :page="item"
    :tabs="tabs"
    :closeable="closeable"
    :splittable="splittable"
    :back="back"
    @back="$emit('back')"
    @execute-action="(action, entry) => $emit('execute-action', action, entry)"
    @open-page="page => $emit('open-page', page)"
    @open-call="request => $emit('open-call', request)"
    @refresh="$emit('refresh')"
    @select-tab="$emit('select-tab', $event)"
    @close-tab="$emit('close-tab', $event)"
    @add-tab="$emit('add-tab', $event)"
    @split="orientation => $emit('split', orientation)"
    @close="$emit('close')"
  />
  <section
    v-else
    class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
    data-empty-workspace-pane
  >
    <GeneratedPaneHeader
      :tabs="tabs"
      :active-key="activeKey"
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
    <div class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-muted">
      <i class="pi pi-folder-open" aria-hidden="true" />
      <span>{{ $t('project.openSomething') }}</span>
    </div>
  </section>
</template>

<script setup>
// The workspace pane dispatcher: opened screens (type screens and
// instance-bound detail screens) and registered workspace pages.
import GeneratedWorkspacePage from '~/components/generated/GeneratedWorkspacePage.vue';
import GeneratedScreenPane from '~/components/generated/GeneratedScreenPane.vue';
import GeneratedPaneHeader from '~/components/generated/GeneratedPaneHeader.vue';

defineProps({
  item: { type: Object, default: null },
  tabs: { type: Array, default: () => [] },
  // The pane's selected tab key: the empty branch has no item to derive it
  // from, so the host feeds the pane's selection directly.
  activeKey: { type: String, default: '' },
  closeable: { type: Boolean, default: false },
  splittable: { type: Boolean, default: true },
  // The pane's navigation history has somewhere to go: renders the Back
  // control at the start of the pane header.
  back: { type: Boolean, default: false }
});

defineEmits(['execute-action', 'open-entity', 'open-page', 'open-call', 'refresh', 'select-tab', 'close-tab', 'add-tab', 'split', 'close', 'back']);
</script>
