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
    <section v-if="graph.interface?.inputs?.length" class="flex flex-col gap-2">
      <strong class="text-supporting">{{ $t('processDesigner.graphInputValues') }}</strong>
      <div v-for="port in graph.interface.inputs" :key="port.id" class="flex flex-col gap-1">
        <label class="text-supporting text-muted" :for="`graph-input-${port.id}`">{{ port.label || port.id }}</label>
        <Textarea :id="`graph-input-${port.id}`" v-model="inputDrafts[port.id]" rows="2" auto-resize class="w-full text-supporting" />
        <Message v-if="inputErrors[port.id]" severity="error">{{ inputErrors[port.id] }}</Message>
        <Button size="small" severity="secondary" :label="$t('processDesigner.applyGraphInput')" @click="applyInput(port.id)" />
      </div>
    </section>
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
import { reactive, watch } from 'vue';
import Button from 'primevue/button';
import Textarea from 'primevue/textarea';
import Message from 'primevue/message';
import StateBlock from '~/components/shared/StateBlock.vue';

const props = defineProps({
  result: { type: Object, default: null },
  error: { type: String, default: '' },
  running: { type: Boolean, default: false },
  graph: { type: Object, default: () => ({}) },
  inputBindings: { type: Object, default: () => ({}) }
});
const emit = defineEmits(['refresh', 'update-input-binding']);
const inputDrafts = reactive({});
const inputErrors = reactive({});

watch(
  () => [props.graph.interface?.inputs || [], props.inputBindings],
  ([ports, bindings]) => {
    for (const key of Object.keys(inputDrafts)) {
      if (!ports.some(port => port.id === key)) delete inputDrafts[key];
    }
    for (const port of ports) {
      const value = Object.hasOwn(bindings, port.id) ? bindings[port.id] : port.default;
      inputDrafts[port.id] = JSON.stringify(value === undefined ? null : value, null, 2);
    }
  },
  { immediate: true, deep: true }
);

function applyInput(portId) {
  try {
    const value = JSON.parse(inputDrafts[portId] || 'null');
    delete inputErrors[portId];
    emit('update-input-binding', { portId, value });
  } catch (cause) {
    inputErrors[portId] = cause.message || String(cause);
  }
}

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
