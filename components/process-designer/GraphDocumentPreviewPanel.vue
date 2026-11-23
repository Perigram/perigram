<template>
  <div class="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3">
    <div class="flex shrink-0 items-center justify-between gap-2">
      <span class="text-label">{{ $t('processDesigner.graphOutputs') }}</span>
      <Button icon="pi pi-refresh" size="small" text :loading="running" :aria-label="$t('processDesigner.refreshPreview')" @click="$emit('refresh')" />
    </div>
    <Message v-if="error" severity="error">{{ error }}</Message>
    <section v-if="result && outputOptions.length" class="flex min-h-0 flex-1 flex-col gap-2">
      <label class="text-supporting text-muted" for="graph-preview-output">{{ $t('processDesigner.graphOutput') }}</label>
      <InstanceSelect
        id="graph-preview-output"
        v-model="selectedOutputId"
        :options="outputOptions"
        option-label="label"
        option-value="_id"
        :aria-label="$t('processDesigner.graphOutput')"
        class="w-full"
      />
      <div v-if="execution" class="text-supporting text-muted">{{ $t('processDesigner.previewExecution') }} · {{ execution.status }} · {{ execution.id }}</div>
      <div class="flex flex-wrap gap-1" role="tablist" :aria-label="$t('processDesigner.previewRepresentations')">
        <Button
          v-for="view in availableViews"
          :key="view.value"
          :label="view.label"
          size="small"
          :severity="activeView === view.value ? 'primary' : 'secondary'"
          :outlined="activeView !== view.value"
          @click="chooseView(view.value)"
        />
      </div>
      <div class="min-h-48 flex-1 overflow-hidden rounded-ui bg-subtle p-3">
        <PreviewChannelMount
          v-if="activeView.startsWith('channel:') && activeChannel"
          :channel="activeChannel"
          :payload="channelPayload"
        />
        <PreviewChannelMount
          v-else-if="activeView === 'plugin' && rendererForOutput && typeof rendererForOutput === 'object'"
          :channel="rendererForOutput"
          :payload="{ value: selectedValue, output: selectedOutput }"
        />
        <component
          :is="rendererForOutput"
          v-else-if="activeView === 'plugin' && typeof rendererForOutput === 'function'"
          :value="selectedValue"
          :output="selectedOutput"
        />
        <GraphOutputView
          v-else
          :value="selectedValue"
          :view="activeView"
          :representation="selectedOutput?.contract?.semantic?.representation || ''"
          :alt="selectedOutput?.label || 'Graph output'"
          fill
        />
      </div>
    </section>
    <Message v-if="providerErrors.length" severity="warn">
      <div class="flex flex-col gap-2">
        <div v-for="(failure, index) in providerErrors" :key="`${failure.pluginId}:${failure.runtimeId}:${failure.provider}:${index}`" class="flex flex-col gap-1">
          <strong>{{ failure.provider || failure.pluginId }}<span v-if="failure.runtimeId"> · {{ failure.runtimeId }}</span></strong>
          <span>{{ failure.message }}</span>
          <span v-if="failure.operations?.length" class="text-supporting text-muted">{{ failure.operations.join(', ') }}</span>
        </div>
      </div>
    </Message>
    <details v-if="result" class="shrink-0">
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
import { computed, ref, watch } from 'vue';
import Button from 'primevue/button';
import Message from 'primevue/message';
import InstanceSelect from '~/components/shared/InstanceSelect.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import PreviewChannelMount from '~/components/process-designer/PreviewChannelMount.vue';
import { GRAPH_OUTPUT_OPERATION } from '@perigram/core';
import { graphOutputViews } from '~/utils/graphOutputViews.js';
import { isDocumentsPreviewValue } from '~/utils/documents-preview.js';
import GraphOutputView from '~/components/shared/GraphOutputView.vue';

const props = defineProps({
  result: { type: Object, default: null },
  execution: { type: Object, default: null },
  error: { type: String, default: '' },
  running: { type: Boolean, default: false },
  graph: { type: Object, default: () => ({}) },
  previewRenderers: { type: Object, default: () => ({}) },
  nodeDefinitions: { type: Object, default: () => ({}) },
  channels: { type: Array, default: () => [] },
  providerErrors: { type: Array, default: () => [] }
});
defineEmits(['refresh']);

const selectedOutputId = ref('');
const activeView = ref('json');
const viewChosen = ref(false);
function chooseView(view) {
  viewChosen.value = true;
  activeView.value = view;
}
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
// A cast or conversion keeps the upstream plugin renderer available:
// walk the value chain until a definition declares a renderer.
const rendererForOutput = computed(() => {
  const seen = new Set();
  let node = sourceNode.value;
  for (let depth = 0; node && depth < 16 && !seen.has(node.id); depth += 1) {
    seen.add(node.id);
    const definition = props.nodeDefinitions?.[node.id];
    const rendererId = definition?.preview?.renderer;
    if (rendererId) return props.previewRenderers?.[`${definition.provider}:${rendererId}`] || null;
    const edge = props.graph.edges?.find(item => item.target?.node === node.id && item.target?.port === 'value');
    node = props.graph.nodes?.find(candidate => candidate.id === edge?.source?.node) || null;
  }
  return null;
});
const activeChannel = computed(() => props.channels.find(channel => `channel:${channel.id}` === activeView.value) || null);
const channelPayload = computed(() => ({
  ...props.result,
  graph: props.graph,
  execution: props.execution,
  selectedOutput: selectedOutput.value ? { id: selectedOutput.value.id, label: selectedOutput.value.label, value: selectedValue.value } : null
}));
const availableViews = computed(() => {
  const views = graphOutputViews(selectedValue.value, {
    hasPluginRenderer: Boolean(rendererForOutput.value),
    representation: selectedOutput.value?.contract?.semantic?.representation || ''
  });
  for (const channel of props.channels) views.push({ value: `channel:${channel.id}`, label: channel.label });
  return views;
});
watch(outputOptions, options => {
  if (!options.some(option => option._id === selectedOutputId.value)) {
    selectedOutputId.value = options[0]?._id || '';
    viewChosen.value = false;
  }
}, { immediate: true });
watch(selectedOutputId, () => { viewChosen.value = false; });
watch(availableViews, views => {
  const value = selectedValue.value;
  const documentsChannel = props.channels.find(channel => channel.id === 'documents');
  const preferred = isDocumentsPreviewValue(value) && documentsChannel ? `channel:${documentsChannel.id}` : '';
  if (preferred && views.some(view => view.value === preferred)) activeView.value = preferred;
  else if (!viewChosen.value) activeView.value = views[0]?.value || 'json';
  else if (!views.some(view => view.value === activeView.value)) activeView.value = views[0]?.value || 'json';
}, { immediate: true });

function format(value) {
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}
function nodeLabel(id) {
  const node = props.graph.nodes?.find(item => item.id === id);
  return node?.operation?.id || id;
}
</script>
