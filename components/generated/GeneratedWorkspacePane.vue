<template>
  <GeneratedEntityFile
    v-if="item?.kind === 'entity'"
    :item="item"
    :action-entries="actionEntries"
    :closeable="closeable"
    :splittable="splittable"
    :show-explorer-toggle="showExplorerToggle"
    :show-generated-actions="item.type !== 'project'"
    @execute-action="(action, entry) => $emit('execute-action', action, entry)"
    @open-page="page => $emit('open-page', page)"
    @refresh="$emit('refresh')"
    @split="orientation => $emit('split', orientation)"
    @close="$emit('close')"
    @toggle-explorer="$emit('toggle-explorer')"
  />
  <GeneratedWorkspacePage
    v-else-if="item?.kind === 'page'"
    :page="item"
    :closeable="closeable"
    :splittable="splittable"
    :show-explorer-toggle="showExplorerToggle"
    @execute-action="(action, entry) => $emit('execute-action', action, entry)"
    @open-page="page => $emit('open-page', page)"
    @refresh="$emit('refresh')"
    @split="orientation => $emit('split', orientation)"
    @close="$emit('close')"
    @toggle-explorer="$emit('toggle-explorer')"
  />
</template>

<script setup>
import GeneratedEntityFile from '~/components/generated/GeneratedEntityFile.vue';
import GeneratedWorkspacePage from '~/components/generated/GeneratedWorkspacePage.vue';

defineProps({
  item: { type: Object, default: null },
  actionEntries: { type: Array, default: () => [] },
  closeable: { type: Boolean, default: false },
  splittable: { type: Boolean, default: true },
  showExplorerToggle: { type: Boolean, default: false }
});

defineEmits(['execute-action', 'open-page', 'refresh', 'split', 'close', 'toggle-explorer']);
</script>
