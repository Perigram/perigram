<template>
  <!-- Opened screens (type screens and instance-bound detail screens) and
       registered workspace pages: every dock panel is a screen or page
       reference. -->
  <GeneratedScreenPane
    v-if="item?.kind === 'screen'"
    :key="item?.key || item?.screenKey"
    :item="item"
    @refresh="$emit('refresh')"
    @open-entity="request => $emit('open-entity', request)"
  />
  <GeneratedWorkspacePage
    v-else-if="item?.kind === 'page' && !item.pending"
    :key="item?.key"
    :page="item"
    @open-page="page => $emit('open-page', page)"
    @open-call="request => $emit('open-call', request)"
    @refresh="$emit('refresh')"
    @close-tab="$emit('close-tab', $event)"
  />
  <section
    v-else-if="item?.kind === 'page'"
    class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden p-4"
  >
    <StateBlock state="loading" :message="$t('common.loading')" />
  </section>
  <section
    v-else
    class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
    data-empty-workspace-pane
  >
    <div class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-muted">
      <i class="pi pi-folder-open" aria-hidden="true" />
      <span>{{ $t('project.openSomething') }}</span>
    </div>
  </section>
</template>

<script setup>
// The workspace panel dispatcher: opened screens (type screens and
// instance-bound detail screens) and registered workspace pages.
import GeneratedWorkspacePage from '~/components/generated/GeneratedWorkspacePage.vue';
import GeneratedScreenPane from '~/components/generated/GeneratedScreenPane.vue';
import StateBlock from '~/components/shared/StateBlock.vue';

defineProps({
  item: { type: Object, default: null }
});

defineEmits(['open-entity', 'open-page', 'open-call', 'refresh', 'close-tab']);
</script>
