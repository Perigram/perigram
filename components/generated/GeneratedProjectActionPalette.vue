<template>
  <div class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" data-project-action-palette>
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
