<template>
  <div
    class="flex h-full min-h-0 min-w-0 content-start flex-wrap items-start gap-2 overflow-y-auto p-2"
    data-project-file-actions
  >
    <GeneratedActionButton
      v-for="entry in actionEntries"
      :key="entry.key"
      :action-id="entry.actionId"
      @execute="action => $emit('execute-action', action, entry)"
    />
  </div>
</template>

<script setup>
import GeneratedActionButton from '~/components/generated/GeneratedActionButton.vue';

defineProps({
  actionEntries: { type: Array, default: () => [] }
});

defineEmits(['execute-action']);
</script>
