<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between gap-2">
      <span class="text-label">{{ $t('processDesigner.graphOutputs') }}</span>
      <Button
        icon="pi pi-refresh"
        size="small"
        text
        :loading="running"
        :aria-label="$t('processDesigner.refreshPreview')"
        @click="$emit('refresh')"
      />
    </div>
    <Message v-if="error" severity="error">{{ error }}</Message>
    <section v-if="result" class="flex flex-col gap-2">
      <strong class="text-supporting">{{ $t('processDesigner.graphOutputs') }}</strong>
      <div v-for="(value, id) in result.outputs" :key="id" class="rounded-ui bg-subtle p-2">
        <strong class="block text-supporting">{{ outputLabel(id) }}</strong>
        <pre class="mt-1 whitespace-pre-wrap break-all text-supporting">{{ format(value) }}</pre>
      </div>
      <strong class="mt-2 text-supporting">{{ $t('processDesigner.graphNodeOutputs') }}</strong>
      <div v-for="(outputs, nodeId) in result.nodeOutputs" :key="nodeId" class="rounded-ui bg-subtle p-2">
        <strong class="block text-supporting">{{ nodeLabel(nodeId) }}</strong>
        <pre class="mt-1 whitespace-pre-wrap break-all text-supporting">{{ format(outputs) }}</pre>
      </div>
    </section>
    <StateBlock v-else-if="!running && !error" :message="$t('processDesigner.noPreviewOutputs')" />
  </div>
</template>

<script setup>
import Button from 'primevue/button';
import Message from 'primevue/message';
import StateBlock from '~/components/shared/StateBlock.vue';

const props = defineProps({
  result: { type: Object, default: null },
  error: { type: String, default: '' },
  running: { type: Boolean, default: false },
  graph: { type: Object, default: () => ({}) }
});
defineEmits(['refresh']);

function format(value) {
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}
function outputLabel(id) {
  return props.graph.interface?.outputs?.find(port => port.id === id)?.label || id;
}
function nodeLabel(id) {
  const node = props.graph.nodes?.find(item => item.id === id);
  return node?.operation?.id || id;
}
</script>
