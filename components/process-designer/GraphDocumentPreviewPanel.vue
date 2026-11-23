<template>
  <div class="flex h-full min-h-0 flex-col gap-2 p-2">
    <div v-if="showControls" class="flex min-w-0 flex-wrap items-center gap-1">
      <InstanceSelect
        v-if="outputOptions.length > 1"
        id="graph-preview-output"
        :model-value="selectedOutputId"
        :options="outputOptions"
        option-label="label"
        option-value="_id"
        :aria-label="$t('processDesigner.graphOutput')"
        class="min-w-40 flex-1"
        @update:model-value="chooseOutput"
      />
      <div v-if="availableViews.length > 1" class="flex flex-wrap gap-1" role="tablist" :aria-label="$t('processDesigner.previewRepresentations')">
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
    </div>
    <Message v-if="error" severity="error" class="shrink-0">{{ error }}</Message>
    <Message v-if="providerErrors.length" severity="warn" class="shrink-0">
      <div v-for="(failure, index) in providerErrors" :key="`${failure.pluginId}:${failure.runtimeId}:${failure.provider}:${index}`">
        {{ failure.provider || failure.pluginId }}: {{ failure.message }}
      </div>
    </Message>
    <div class="relative min-h-0 flex-1 overflow-hidden rounded-ui bg-subtle">
      <div v-if="running && !result" class="grid h-full place-items-center">
        <StateBlock state="loading" :message="$t('common.loading')" />
      </div>
      <div v-else-if="!error && (!result || !outputOptions.length)" class="grid h-full place-items-center">
        <StateBlock :message="$t('processDesigner.noPreviewOutputs')" />
      </div>
      <template v-else-if="result && outputOptions.length">
        <PreviewChannelMount
          v-if="activeView.startsWith('channel:') && activeChannel"
          :channel="activeChannel"
          :payload="channelPayload"
        />
        <PreviewChannelMount
          v-else-if="activeView === 'plugin' && rendererForOutput && typeof rendererForOutput === 'object'"
          :channel="rendererForOutput"
          :payload="{ value: selectedValue, output: selectedPort }"
        />
        <component
          :is="rendererForOutput"
          v-else-if="activeView === 'plugin' && typeof rendererForOutput === 'function'"
          :value="selectedValue"
          :output="selectedPort"
        />
        <GraphOutputView
          v-else
          :value="selectedValue"
          :view="activeView"
          :representation="selectedOption?.representation || ''"
          :alt="selectedOption?.label || 'Graph output'"
          fill
        />
      </template>
      <Button
        icon="pi pi-refresh"
        size="small"
        text
        :loading="running"
        :aria-label="$t('processDesigner.refreshPreview')"
        class="absolute right-2 top-2 z-10"
        @click="$emit('refresh')"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import Button from 'primevue/button';
import Message from 'primevue/message';
import InstanceSelect from '~/components/shared/InstanceSelect.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import PreviewChannelMount from '~/components/process-designer/PreviewChannelMount.vue';
import { GRAPH_INPUT_OPERATION, GRAPH_OUTPUT_OPERATION } from '@perigram/core';
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
const outputChosen = ref(false);
function chooseOutput(value) {
  selectedOutputId.value = value;
  outputChosen.value = true;
}
function chooseView(view) {
  viewChosen.value = true;
  activeView.value = view;
}
const declaredOutputOptions = computed(() => (props.graph.interface?.outputs || []).map(port => ({
  _id: `graph:${port.id}`,
  interfaceId: String(port.id),
  label: String(port.label || port.id),
  representation: port.contract?.semantic?.representation
    || props.result?.outputs?.[port.id]?.representation
    || '',
  value: props.result?.outputs?.[port.id]
})));
// Every evaluated node output is selectable beside the declared graph
// outputs, so a canvas node renders its own value whether or not a Graph
// Output boundary exposes it.
const nodeOutputOptions = computed(() => {
  const nodes = new Map((props.graph.nodes || []).map(node => [node.id, node]));
  const options = [];
  for (const [nodeId, outputs] of Object.entries(props.result?.nodeOutputs || {})) {
    const node = nodes.get(nodeId);
    if (!node || [GRAPH_INPUT_OPERATION, GRAPH_OUTPUT_OPERATION].includes(node.operation?.id)) continue;
    const definition = props.nodeDefinitions?.[nodeId];
    for (const [portId, value] of Object.entries(outputs || {})) {
      const port = definition?.outputs?.find(item => item.id === portId);
      options.push({
        _id: `node:${nodeId}:${portId}`,
        nodeId,
        portId,
        label: `${definition?.label || node.operation?.id || nodeId} · ${port?.label || portId}`,
        representation: port?.semantic?.representation || value?.representation || '',
        value
      });
    }
  }
  return options;
});
const outputOptions = computed(() => [...declaredOutputOptions.value, ...nodeOutputOptions.value]);
const selectedOption = computed(() => outputOptions.value.find(option => option._id === selectedOutputId.value) || null);
const selectedValue = computed(() => selectedOption.value?.value);
const selectedOutput = computed(() => selectedOption.value?.interfaceId
  ? props.graph.interface?.outputs?.find(port => port.id === selectedOption.value.interfaceId) || null
  : null);
const selectedPort = computed(() => selectedOutput.value
  || (selectedOption.value?.nodeId
    ? props.nodeDefinitions?.[selectedOption.value.nodeId]?.outputs?.find(port => port.id === selectedOption.value.portId) || null
    : null));
const outputNode = computed(() => props.graph.nodes?.find(node => (
  node.operation?.id === GRAPH_OUTPUT_OPERATION && node.config?.interfaceId === selectedOutput.value?.id
)));
const sourceNode = computed(() => {
  if (selectedOption.value?.nodeId) {
    return props.graph.nodes?.find(node => node.id === selectedOption.value.nodeId) || null;
  }
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
  selectedOutput: selectedOption.value
    ? { id: selectedOption.value.interfaceId || selectedOption.value._id, label: selectedOption.value.label, value: selectedValue.value }
    : null
}));
const availableViews = computed(() => {
  const views = graphOutputViews(selectedValue.value, {
    hasPluginRenderer: Boolean(rendererForOutput.value),
    representation: selectedOption.value?.representation || ''
  });
  for (const channel of props.channels) views.push({ value: `channel:${channel.id}`, label: channel.label });
  return views;
});
const showControls = computed(() => outputOptions.value.length > 0
  && (outputOptions.value.length > 1 || availableViews.value.length > 1));
watch([outputOptions, () => props.previewRenderers], ([options]) => {
  if (outputChosen.value && options.some(option => option._id === selectedOutputId.value)) return;
  const preferred = preferredOutput(options);
  if (preferred && preferred._id !== selectedOutputId.value) {
    selectedOutputId.value = preferred._id;
    viewChosen.value = false;
  }
}, { immediate: true });
// Default output: a scene value, then a node output whose plugin
// renderer is mounted, then the declared graph output, then the first
// node output.
function preferredOutput(options) {
  return options.find(option => ['perigram.scene-3d', 'perigram.scene-2d'].includes(option.representation))
    || options.find(option => Boolean(nodeRenderer(option)))
    || options.find(option => option.interfaceId)
    || options[0]
    || null;
}
function nodeRenderer(option) {
  const definition = props.nodeDefinitions?.[option.nodeId];
  const rendererId = definition?.preview?.renderer;
  return rendererId ? props.previewRenderers?.[`${definition.provider}:${rendererId}`] : null;
}
watch(selectedOutputId, () => { viewChosen.value = false; });
watch(availableViews, views => {
  const value = selectedValue.value;
  const documentsChannel = props.channels.find(channel => channel.id === 'documents');
  const preferred = isDocumentsPreviewValue(value) && documentsChannel ? `channel:${documentsChannel.id}` : '';
  if (preferred && views.some(view => view.value === preferred)) activeView.value = preferred;
  else if (!viewChosen.value) activeView.value = views[0]?.value || 'json';
  else if (!views.some(view => view.value === activeView.value)) activeView.value = views[0]?.value || 'json';
}, { immediate: true });
</script>
