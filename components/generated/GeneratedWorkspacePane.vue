<template>
  <GeneratedEntityFile
    v-if="item?.kind === 'entity'"
    :item="item"
    :tabs="tabs"
    :available-tabs="availableTabs"
    :action-entries="actionEntries"
    :closeable="closeable"
    :splittable="splittable"
    :show-generated-actions="item.type !== 'project'"
    @execute-action="(action, entry) => $emit('execute-action', action, entry)"
    @open-entity="request => $emit('open-entity', request)"
    @open-page="page => $emit('open-page', page)"
    @refresh="$emit('refresh')"
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
    :available-tabs="availableTabs"
    :closeable="closeable"
    :splittable="splittable"
    @execute-action="(action, entry) => $emit('execute-action', action, entry)"
    @open-page="page => $emit('open-page', page)"
    @refresh="$emit('refresh')"
    @select-tab="$emit('select-tab', $event)"
    @close-tab="$emit('close-tab', $event)"
    @add-tab="$emit('add-tab', $event)"
    @split="orientation => $emit('split', orientation)"
    @close="$emit('close')"
  />
  <section
    v-else
    class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-content"
    data-empty-workspace-pane
  >
    <header data-pane-header class="flex h-10 shrink-0 items-center gap-1 border-b [border-color:var(--ck-chrome-border)] bg-chrome pr-1 text-[var(--ck-chrome-foreground)]">
      <GeneratedWorkspaceTabs
        :tabs="tabs"
        :available-tabs="availableTabs"
        active-key=""
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
    <div class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-muted-color">
      <i class="pi pi-folder-open" aria-hidden="true" />
      <span>{{ $t('project.openSomething') }}</span>
    </div>
  </section>
</template>

<script setup>
import GeneratedEntityFile from '~/components/generated/GeneratedEntityFile.vue';
import GeneratedWorkspacePage from '~/components/generated/GeneratedWorkspacePage.vue';
import GeneratedWorkspaceTabs from '~/components/generated/GeneratedWorkspaceTabs.vue';
import GeneratedWorkspacePaneMenu from '~/components/generated/GeneratedWorkspacePaneMenu.vue';

defineProps({
  item: { type: Object, default: null },
  tabs: { type: Array, default: () => [] },
  availableTabs: { type: Array, default: () => [] },
  actionEntries: { type: Array, default: () => [] },
  closeable: { type: Boolean, default: false },
  splittable: { type: Boolean, default: true }
});

defineEmits(['execute-action', 'open-entity', 'open-page', 'refresh', 'select-tab', 'close-tab', 'add-tab', 'split', 'close']);
</script>
