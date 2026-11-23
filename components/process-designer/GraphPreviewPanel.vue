<template>
  <div class="flex h-full min-h-0 flex-col">
    <GraphOutputsChannel
      :payload="payload"
      :nodes="nodes"
      :channels="channels"
      :running="running"
      :error="error"
      @refresh="$emit('refresh')"
    />
  </div>
</template>

<script setup>
import GraphOutputsChannel from '~/components/process-designer/GraphOutputsChannel.vue';

defineProps({
  channels: { type: Array, default: () => [] },
  payload: { type: Object, default: null },
  nodes: { type: Array, default: () => [] },
  running: { type: Boolean, default: false },
  error: { type: String, default: '' }
});

defineEmits(['refresh']);
</script>
