<template>
  <GeneratedEntityFile
    v-if="item?.kind === 'entity'"
    :item="item"
    :tabs="tabs"
    :available-tabs="availableTabs"
    :dirty-tab-keys="dirtyTabKeys"
    :pane-id="paneId"
    :action-entries="actionEntries"
    :closeable="closeable"
    :splittable="splittable"
    :maximizable="maximizable"
    :maximized="maximized"
    :can-reopen="canReopen"
    :show-generated-actions="item.type !== 'project'"
    @execute-action="(action, entry) => $emit('execute-action', action, entry)"
    @open-entity="request => $emit('open-entity', request)"
    @open-page="page => $emit('open-page', page)"
    @refresh="$emit('refresh')"
    @dirty-change="$emit('dirty-change', $event)"
    @reorder-tab="$emit('reorder-tab', $event)"
    @move-tab="$emit('move-tab', $event)"
    @toggle-maximize="$emit('toggle-maximize')"
    @reopen="$emit('reopen')"
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
    :dirty-tab-keys="dirtyTabKeys"
    :pane-id="paneId"
    :closeable="closeable"
    :splittable="splittable"
    :maximizable="maximizable"
    :maximized="maximized"
    :can-reopen="canReopen"
    @execute-action="(action, entry) => $emit('execute-action', action, entry)"
    @open-page="page => $emit('open-page', page)"
    @refresh="$emit('refresh')"
    @dirty-change="$emit('dirty-change', $event)"
    @reorder-tab="$emit('reorder-tab', $event)"
    @move-tab="$emit('move-tab', $event)"
    @toggle-maximize="$emit('toggle-maximize')"
    @reopen="$emit('reopen')"
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
        :dirty-tab-keys="dirtyTabKeys"
        :pane-id="paneId"
        active-key=""
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
    <div class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-muted-color">
      <i class="pi pi-folder-open text-2xl" aria-hidden="true" />
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
  dirtyTabKeys: { type: Array, default: () => [] },
  paneId: { type: String, default: '' },
  actionEntries: { type: Array, default: () => [] },
  closeable: { type: Boolean, default: false },
  splittable: { type: Boolean, default: true },
  maximizable: { type: Boolean, default: true },
  maximized: { type: Boolean, default: false },
  canReopen: { type: Boolean, default: false }
});

defineEmits(['execute-action', 'open-entity', 'open-page', 'refresh', 'dirty-change', 'select-tab', 'close-tab', 'add-tab', 'reorder-tab', 'move-tab', 'split', 'close', 'toggle-maximize', 'reopen']);
</script>
