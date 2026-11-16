<template>
  <div class="flex min-h-0 flex-col gap-3 overflow-y-auto p-3">
    <div class="flex items-center justify-between gap-2">
      <span class="text-label">{{ $t('processDesigner.graphOutputs') }}</span>
      <Button icon="pi pi-refresh" size="small" text :loading="running" :aria-label="$t('processDesigner.refreshPreview')" @click="$emit('refresh')" />
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
    <section v-if="result && outputOptions.length" class="flex min-h-0 flex-col gap-2">
      <label class="text-supporting text-muted" for="graph-preview-output">{{ $t('processDesigner.graphOutput') }}</label>
      <InstanceSelect
        id="graph-preview-output"
        v-model="selectedOutputId"
        :options="outputOptions"
        option-label="label"
        option-value="_id"
        class="w-full"
      />
      <div class="flex flex-wrap gap-1" role="tablist" :aria-label="$t('processDesigner.previewRepresentations')">
        <Button
          v-for="view in availableViews"
          :key="view.value"
          :label="view.label"
          size="small"
          :severity="activeView === view.value ? 'primary' : 'secondary'"
          :outlined="activeView !== view.value"
          @click="activeView = view.value"
        />
      </div>
      <div class="min-h-0 rounded-ui bg-subtle p-3">
        <component
          :is="rendererForOutput"
          v-if="activeView === 'plugin' && rendererForOutput"
          :value="selectedValue"
          :output="selectedOutput"
        />
        <pre v-else-if="activeView === 'text'" class="whitespace-pre-wrap break-words text-supporting">{{ selectedValue }}</pre>
        <div v-else-if="activeView === 'markdown'" class="whitespace-pre-wrap break-words text-supporting">{{ selectedValue }}</div>
        <div v-else-if="activeView === 'table' && Array.isArray(selectedValue)" class="overflow-x-auto">
          <table class="w-full text-supporting">
            <thead><tr><th v-for="column in tableColumns" :key="column" class="p-2 text-left">{{ column }}</th></tr></thead>
            <tbody>
              <tr v-for="(row, index) in selectedValue" :key="index">
                <td v-for="column in tableColumns" :key="column" class="border-t border-surface p-2">{{ format(row?.[column]) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <a
          v-else-if="activeView === 'document' && selectedValue?.fileId"
          class="text-supporting underline"
          :href="`/api/files/download/${encodeURIComponent(selectedValue.fileId)}?bucket=${encodeURIComponent(selectedValue.bucket || 'files')}`"
          target="_blank"
          rel="noopener"
        >{{ selectedValue.name || $t('processDesigner.openGraphArtifact') }}</a>
        <pre v-else class="whitespace-pre-wrap break-all text-supporting">{{ format(selectedValue) }}</pre>
      </div>
    </section>
    <details v-if="result" class="flex flex-col gap-2">
      <summary class="text-supporting text-muted">{{ $t('processDesigner.graphNodeOutputs') }}</summary>
      <div v-for="(outputs, nodeId) in result.nodeOutputs" :key="nodeId" class="rounded-ui bg-subtle p-2">
        <strong class="block text-supporting">{{ nodeLabel(nodeId) }}</strong>
        <pre class="mt-1 whitespace-pre-wrap break-all text-supporting">{{ format(outputs) }}</pre>
      </div>
    </details>
    <StateBlock v-else-if="!running && !error" :message="$t('processDesigner.noPreviewOutputs')" />
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import Button from 'primevue/button';
import Textarea from 'primevue/textarea';
import Message from 'primevue/message';
import InstanceSelect from '~/components/shared/InstanceSelect.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import { GRAPH_OUTPUT_OPERATION } from '@perigram/core';

const props = defineProps({
  result: { type: Object, default: null },
  error: { type: String, default: '' },
  running: { type: Boolean, default: false },
  graph: { type: Object, default: () => ({}) },
  inputBindings: { type: Object, default: () => ({}) },
  previewRenderers: { type: Object, default: () => ({}) },
  nodeDefinitions: { type: Object, default: () => ({}) }
});
const emit = defineEmits(['refresh', 'update-input-binding']);
const inputDrafts = reactive({});
const inputErrors = reactive({});
const selectedOutputId = ref('');
const activeView = ref('json');
const outputOptions = computed(() => (props.graph.interface?.outputs || []).map(port => ({
  _id: String(port.id),
  label: String(port.label || port.id)
})));
const selectedValue = computed(() => props.result?.outputs?.[selectedOutputId.value]);
const selectedOutput = computed(() => props.graph.interface?.outputs?.find(port => port.id === selectedOutputId.value) || null);
const outputNode = computed(() => props.graph.nodes?.find(node => (
  node.operation?.id === GRAPH_OUTPUT_OPERATION && node.config?.interfaceId === selectedOutputId.value
)));
const sourceNode = computed(() => {
  const edge = props.graph.edges?.find(item => item.target?.node === outputNode.value?.id && item.target?.port === 'value');
  return props.graph.nodes?.find(node => node.id === edge?.source?.node) || null;
});
const sourceDefinition = computed(() => props.nodeDefinitions?.[sourceNode.value?.id] || null);
const rendererForOutput = computed(() => {
  const rendererId = sourceDefinition.value?.preview?.renderer;
  if (!rendererId) return null;
  return props.previewRenderers?.[`${sourceDefinition.value.provider}:${rendererId}`] || null;
});
const availableViews = computed(() => {
  const value = selectedValue.value;
  const views = [{ value: 'json', label: 'JSON' }];
  if (rendererForOutput.value) views.unshift({ value: 'plugin', label: 'Specialized' });
  if (typeof value === 'string') views.unshift({ value: 'text', label: 'Text' }, { value: 'markdown', label: 'Markdown' });
  if (Array.isArray(value) && value.length && value.every(item => item && typeof item === 'object' && !Array.isArray(item))) {
    views.unshift({ value: 'table', label: 'Table' });
  }
  if (value && typeof value === 'object' && value.fileId) views.unshift({ value: 'document', label: 'Document' });
  return views;
});
const tableColumns = computed(() => [...new Set((Array.isArray(selectedValue.value) ? selectedValue.value : []).flatMap(row => Object.keys(row || {})))]);
watch(outputOptions, options => {
  if (!options.some(option => option._id === selectedOutputId.value)) selectedOutputId.value = options[0]?._id || '';
}, { immediate: true });
watch(availableViews, views => {
  if (!views.some(view => view.value === activeView.value)) activeView.value = views[0]?.value || 'json';
});
watch(
  () => [props.graph.interface?.inputs || [], props.inputBindings],
  ([ports, bindings]) => {
    for (const key of Object.keys(inputDrafts)) if (!ports.some(port => port.id === key)) delete inputDrafts[key];
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
function nodeLabel(id) {
  const node = props.graph.nodes?.find(item => item.id === id);
  return node?.operation?.id || id;
}
</script>
