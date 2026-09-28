<template>
  <!-- The project overload still owns entity tabs through the legacy
       renderer family; generated home screens never produce entity items
       — their instance surfaces are compiled screen tabs. -->
  <GeneratedInstanceFile
    v-if="item?.kind === 'instance'"
    :item="item"
    :tabs="tabs"
    :action-entries="actionEntries"
    :closeable="closeable"
    :splittable="splittable"
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
      :closeable="closeable"
      :splittable="splittable"
      @refresh="$emit('refresh')"
      @select-tab="$emit('select-tab', $event)"
      @close-tab="$emit('close-tab', $event)"
      @add="$emit('add-tab', $event)"
      @split="orientation => $emit('split', orientation)"
      @close="$emit('close')"
    />
    </div>
    <div class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-muted">
      <i class="pi pi-folder-open" aria-hidden="true" />
      <span>{{ $t('project.openSomething') }}</span>
    </div>
  </section>
</template>

<script setup>
// The workspace pane dispatcher: opened screens (type screens and
// instance-bound detail screens), registered workspace pages, and — for
// the project overload only — legacy entity file tabs. Generated home
// screens produce no entity items: every instance surface there is a
// compiled screen rendered through the generator.
import GeneratedInstanceFile from '~/components/generated/GeneratedInstanceFile.vue';
import GeneratedWorkspacePage from '~/components/generated/GeneratedWorkspacePage.vue';
import GeneratedScreenPane from '~/components/generated/GeneratedScreenPane.vue';
import GeneratedPaneHeader from '~/components/generated/GeneratedPaneHeader.vue';

defineProps({
  item: { type: Object, default: null },
  tabs: { type: Array, default: () => [] },
  actionEntries: { type: Array, default: () => [] },
  closeable: { type: Boolean, default: false },
  splittable: { type: Boolean, default: true }
});

defineEmits(['execute-action', 'open-entity', 'open-page', 'open-call', 'refresh', 'select-tab', 'close-tab', 'add-tab', 'split', 'close']);
</script>
