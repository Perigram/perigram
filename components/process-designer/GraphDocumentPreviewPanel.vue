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
const outputChosen = ref(false);
function chooseOutput(value) {
  selectedOutputId.value = value;
  outputChosen.value = true;
}
function chooseView(view) {
  viewChosen.value = true;
  activeView.value = view;
}
const outputOptions = computed(() => (props.graph.interface?.outputs || []).map(port => ({
  _id: String(port.id),
  label: String(port.label || port.id),
  representation: port.contract?.semantic?.representation
    || props.result?.outputs?.[port.id]?.representation
    || ''
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
const showControls = computed(() => outputOptions.value.length > 0
  && (outputOptions.value.length > 1 || availableViews.value.length > 1));
watch(outputOptions, options => {
  const current = options.find(option => option._id === selectedOutputId.value);
  const scene = options.find(option => ['perigram.scene-3d', 'perigram.scene-2d'].includes(option.representation));
  if (!current || (!outputChosen.value && scene)) {
    selectedOutputId.value = scene?._id || options[0]?._id || '';
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
</script>
