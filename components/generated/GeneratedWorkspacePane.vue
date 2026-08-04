<template>
  <GeneratedEntityFile
    v-if="item?.kind === 'entity'"
    :item="item"
    :action-entries="actionEntries"
    :closeable="closeable"
    :splittable="splittable"
    :show-generated-actions="item.type !== 'project'"
    @execute-action="(action, entry) => $emit('execute-action', action, entry)"
    @open-page="page => $emit('open-page', page)"
    @refresh="$emit('refresh')"
    @split="orientation => $emit('split', orientation)"
    @close="$emit('close')"
  />
  <GeneratedWorkspacePage
    v-else-if="item?.kind === 'page'"
    :page="item"
    :closeable="closeable"
    :splittable="splittable"
    @execute-action="(action, entry) => $emit('execute-action', action, entry)"
    @open-page="page => $emit('open-page', page)"
    @refresh="$emit('refresh')"
    @split="orientation => $emit('split', orientation)"
    @close="$emit('close')"
  />
</template>

<script setup>
import GeneratedEntityFile from '~/components/generated/GeneratedEntityFile.vue';
import GeneratedWorkspacePage from '~/components/generated/GeneratedWorkspacePage.vue';

defineProps({
  item: { type: Object, default: null },
  actionEntries: { type: Array, default: () => [] },
  closeable: { type: Boolean, default: false },
  splittable: { type: Boolean, default: true }
});

defineEmits(['execute-action', 'open-page', 'refresh', 'split', 'close']);
</script>
