<template>
  <GeneratedEntityFile
    v-if="item?.kind === 'entity'"
    :item="item"
    :tabs="tabs"
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
  <GeneratedScreenPane
    v-else-if="item?.kind === 'screen'"
    :item="item"
    :tabs="tabs"
    :closeable="closeable"
    :splittable="splittable"
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
    :closeable="closeable"
    :splittable="splittable"
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
    <div data-pane-header class="flex shrink-0 items-stretch">
      <GeneratedWorkspaceTabs
        :tabs="tabs"
        active-key=""
        @select="$emit('select-tab', $event)"
        @close="$emit('close-tab', $event)"
        @add="$emit('add-tab', $event)"
        @refresh="$emit('refresh')"
      />
      <div class="flex shrink-0 items-center border-b border-chrome-border pr-1">
        <GeneratedWorkspacePaneMenu
          :splittable="splittable"
          :closeable="closeable"
          @split="$emit('split', $event)"
          @close="$emit('close')"
        />
      </div>
    </div>
    <div class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-muted">
      <i class="pi pi-folder-open" aria-hidden="true" />
      <span>{{ $t('project.openSomething') }}</span>
    </div>
  </section>
</template>

<script setup>
import GeneratedEntityFile from '~/components/generated/GeneratedEntityFile.vue';
import GeneratedWorkspacePage from '~/components/generated/GeneratedWorkspacePage.vue';
import GeneratedScreenPane from '~/components/generated/GeneratedScreenPane.vue';
import GeneratedWorkspaceTabs from '~/components/generated/GeneratedWorkspaceTabs.vue';
import GeneratedWorkspacePaneMenu from '~/components/generated/GeneratedWorkspacePaneMenu.vue';

defineProps({
  item: { type: Object, default: null },
  tabs: { type: Array, default: () => [] },
  actionEntries: { type: Array, default: () => [] },
  closeable: { type: Boolean, default: false },
  splittable: { type: Boolean, default: true }
});

defineEmits(['execute-action', 'open-entity', 'open-page', 'open-call', 'refresh', 'select-tab', 'close-tab', 'add-tab', 'split', 'close']);
</script>
