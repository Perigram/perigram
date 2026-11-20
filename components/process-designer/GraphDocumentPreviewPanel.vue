<template>
  <div class="flex min-h-0 flex-col gap-3 overflow-y-auto p-3">
    <div class="flex items-center justify-between gap-2">
      <span class="text-label">{{ $t('processDesigner.graphOutputs') }}</span>
      <Button icon="pi pi-refresh" size="small" text :loading="running" :aria-label="$t('processDesigner.refreshPreview')" @click="$emit('refresh')" />
    </div>
    <Message v-if="error" severity="error">{{ error }}</Message>
    <section v-if="result && outputOptions.length" class="flex min-h-0 flex-col gap-2">
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
      <div class="min-h-0 rounded-ui bg-subtle p-3">
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
          :alt="selectedOutput?.label || 'Graph output'"
        />
      </div>
    </section>
    <section v-if="result && outputOptions.length" class="flex flex-col gap-2 border-t border-surface pt-3">
      <strong class="text-supporting">{{ $t('processDesigner.bakeOutput') }}</strong>
      <label class="text-supporting text-muted" for="graph-bake-page">{{ $t('processDesigner.pageDestination') }}</label>
      <InstanceSelect
        id="graph-bake-page"
        v-model="selectedPageId"
        :options="pageOptions"
        option-label="label"
        option-value="_id"
        :aria-label="$t('processDesigner.pageDestination')"
        class="w-full"
        :placeholder="$t('processDesigner.selectPage')"
      />
      <label class="text-supporting text-muted" for="graph-bake-path">{{ $t('processDesigner.pageFilePath') }}</label>
      <InputText id="graph-bake-path" v-model="pageFilePath" class="w-full" placeholder="exports/result.json" />
      <label class="text-supporting text-muted" for="graph-bake-conflict">{{ $t('processDesigner.conflictPolicy') }}</label>
      <InstanceSelect
        id="graph-bake-conflict"
        v-model="conflictPolicy"
        :options="conflictOptions"
        option-label="label"
        option-value="value"
        :aria-label="$t('processDesigner.conflictPolicy')"
        class="w-full"
      />
      <Button
        size="small"
        icon="pi pi-file-export"
        :label="$t('processDesigner.bakeOutput')"
        :disabled="!canBake"
        :loading="baking"
        @click="submitBake"
      />
      <Message v-if="!canBake && execution?.status === 'succeeded' && !canBakeToSavedGraph" severity="warn">
        {{ $t('processDesigner.bakeRequiresSaved') }}
      </Message>
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
    <section v-if="graph.interface?.inputs?.length" class="flex flex-col gap-2">
      <strong class="text-supporting">{{ $t('processDesigner.graphInputValues') }}</strong>
      <div v-for="port in graph.interface.inputs" :key="port.id" class="flex flex-col gap-1">
        <label class="text-supporting text-muted" :for="`graph-input-${port.id}`">{{ port.label || port.id }}{{ port.required ? ' *' : '' }}</label>
        <InstanceSelect
          v-if="port.contract?.semantic?.kind === 'documents.file-id'"
          :id="`graph-input-${port.id}`"
          :model-value="inputDrafts[port.id] ?? null"
          :options="fileOptions"
          option-label="name"
          option-value="payload.fileId"
          :placeholder="t('processDesigner.selectFile')"
          :disabled="fileOptionsLoading || !fileOptions.length"
          class="w-full"
          @update:model-value="inputDrafts[port.id] = $event"
        />
        <InputText
          v-else-if="port.contract?.shape === 'item' && port.contract?.semantic?.base === 'string'"
          :id="`graph-input-${port.id}`"
          :model-value="inputDrafts[port.id] ?? ''"
          class="w-full"
          @update:model-value="inputDrafts[port.id] = $event"
        />
        <InputNumber
          v-else-if="port.contract?.shape === 'item' && ['number', 'integer'].includes(port.contract?.semantic?.base)"
          :id="`graph-input-${port.id}`"
          :model-value="inputDrafts[port.id] ?? null"
          :use-grouping="false"
          :step="port.contract?.semantic?.base === 'integer' ? 1 : undefined"
          class="w-full"
          @update:model-value="inputDrafts[port.id] = $event"
        />
        <ToggleSwitch
          v-else-if="port.contract?.shape === 'item' && port.contract?.semantic?.base === 'boolean'"
          :model-value="Boolean(inputDrafts[port.id])"
          @update:model-value="inputDrafts[port.id] = $event"
        />
        <Textarea
          v-else
          :id="`graph-input-${port.id}`"
          v-model="inputJsonDrafts[port.id]"
          rows="2"
          auto-resize
          class="w-full text-supporting"
        />
        <Message v-if="port.contract?.semantic?.kind === 'documents.file-id' && fileOptionsError" severity="error">{{ fileOptionsError }}</Message>
        <Message v-else-if="port.contract?.semantic?.kind === 'documents.file-id' && !fileOptionsLoading && !fileOptions.length" severity="info">{{ t('processDesigner.noFilesAvailable') }}</Message>
        <Message v-if="inputErrors[port.id]" severity="error">{{ inputErrors[port.id] }}</Message>
        <Button size="small" severity="secondary" :label="$t('processDesigner.applyGraphInput')" @click="applyInput(port)" />
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
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Textarea from 'primevue/textarea';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import ToggleSwitch from 'primevue/toggleswitch';
import Message from 'primevue/message';
import InstanceSelect from '~/components/shared/InstanceSelect.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import PreviewChannelMount from '~/components/process-designer/PreviewChannelMount.vue';
import { GRAPH_OUTPUT_OPERATION } from '@perigram/core';
import { useInstancesStore } from '~/stores/instances';
import { useRegistryStore } from '~/stores/registry';
import { graphFileOptions } from '~/utils/graph-file-options.js';
import { isDocumentsPreviewValue } from '~/utils/documents-preview.js';
import { graphOutputViews } from '~/utils/graphOutputViews.js';
import GraphOutputView from '~/components/process-designer/GraphOutputView.vue';

const props = defineProps({
  result: { type: Object, default: null },
  execution: { type: Object, default: null },
  error: { type: String, default: '' },
  running: { type: Boolean, default: false },
  graph: { type: Object, default: () => ({}) },
  inputBindings: { type: Object, default: () => ({}) },
  previewRenderers: { type: Object, default: () => ({}) },
  nodeDefinitions: { type: Object, default: () => ({}) },
  canBakeToSavedGraph: { type: Boolean, default: false },
  baking: { type: Boolean, default: false },
  channels: { type: Array, default: () => [] },
  providerErrors: { type: Array, default: () => [] }
});
const emit = defineEmits(['refresh', 'update-input-binding', 'bake']);
const { t } = useI18n();
const instances = useInstancesStore();
const registry = useRegistryStore();
const inputDrafts = reactive({});
const fileOptionsLoading = ref(false);
const fileOptionsError = ref('');
const fileInputPorts = computed(() => (props.graph.interface?.inputs || [])
  .filter(port => port.contract?.semantic?.kind === 'documents.file-id'));
const fileTypeIds = computed(() => [...registry.typesById.values()]
  .filter(type => type.class === 'file')
  .map(type => type.id));
const fileOptions = computed(() => graphFileOptions(fileTypeIds.value, instances.instancePool));
const inputJsonDrafts = reactive({});
const inputErrors = reactive({});
const selectedOutputId = ref('');
const selectedPageId = ref('');
const pageFilePath = ref('exports/result.json');
const conflictPolicy = ref('fail');
const pageOptions = ref([]);
const conflictOptions = computed(() => [
  { value: 'fail', label: t('processDesigner.bakeConflictFail') },
  { value: 'create-revision', label: t('processDesigner.bakeConflictRevision') },
  { value: 'replace', label: t('processDesigner.bakeConflictReplace') },
  { value: 'create-distinct-name', label: t('processDesigner.bakeConflictDistinct') }
]);
const canBake = computed(() => Boolean(
  props.canBakeToSavedGraph
  && props.execution?.status === 'succeeded'
  && props.execution?.profile === 'procedural-preview'
  && selectedOutputId.value
  && selectedPageId.value
  && pageFilePath.value.trim()
  && !props.baking
));
const activeView = ref('json');
// The default representation is the best supported view (SPEC §28.14);
// JSON is an explicit choice. The choice resets per selected output.
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
const sourceDefinition = computed(() => props.nodeDefinitions?.[sourceNode.value?.id] || null);
const rendererForOutput = computed(() => {
  const rendererId = sourceDefinition.value?.preview?.renderer;
  if (!rendererId) return null;
  return props.previewRenderers?.[`${sourceDefinition.value.provider}:${rendererId}`] || null;
});
const activeChannel = computed(() => props.channels.find(channel => `channel:${channel.id}` === activeView.value) || null);
const channelPayload = computed(() => ({
  ...props.result,
  graph: props.graph,
  execution: props.execution,
  selectedOutput: selectedOutput.value ? { id: selectedOutput.value.id, label: selectedOutput.value.label, value: selectedValue.value } : null
}));
const availableViews = computed(() => {
  const views = graphOutputViews(selectedValue.value, { hasPluginRenderer: Boolean(rendererForOutput.value) });
  for (const channel of props.channels) views.push({ value: `channel:${channel.id}`, label: channel.label });
  return views;
});
watch([fileInputPorts, fileTypeIds], async ([ports, typeIds]) => {
  if (!ports.length || !typeIds.length) {
    fileOptionsError.value = '';
    return;
  }
  fileOptionsLoading.value = true;
  fileOptionsError.value = '';
  const results = await Promise.allSettled(typeIds.map(typeId => (
    instances.listInstances(typeId, { limit: 100 }, { silent: true })
  )));
  if (results.every(result => result.status === 'rejected')) {
    fileOptionsError.value = t('processDesigner.filesCouldNotLoad');
  }
  fileOptionsLoading.value = false;
}, { immediate: true });
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
});
watch(
  () => [props.graph.interface?.inputs || [], props.inputBindings],
  ([ports, bindings]) => {
    for (const key of Object.keys(inputDrafts)) if (!ports.some(port => port.id === key)) delete inputDrafts[key];
    for (const key of Object.keys(inputJsonDrafts)) if (!ports.some(port => port.id === key)) delete inputJsonDrafts[key];
    for (const key of Object.keys(inputErrors)) if (!ports.some(port => port.id === key)) delete inputErrors[key];
    for (const port of ports) {
      const value = Object.hasOwn(bindings, port.id) ? bindings[port.id] : port.default;
      const base = port.contract?.semantic?.base || 'json';
      const shape = port.contract?.shape || 'item';
      if (shape === 'item' && base === 'string') inputDrafts[port.id] = value ?? '';
      else if (shape === 'item' && ['number', 'integer'].includes(base)) inputDrafts[port.id] = value ?? null;
      else if (shape === 'item' && base === 'boolean') inputDrafts[port.id] = value ?? false;
      else inputJsonDrafts[port.id] = JSON.stringify(value === undefined ? null : value, null, 2);
    }
  },
  { immediate: true, deep: true }
);

function applyInput(port) {
  const portId = port.id;
  try {
    const base = port.contract?.semantic?.base || 'json';
    const shape = port.contract?.shape || 'item';
    const value = shape === 'item' && base === 'string'
      ? inputDrafts[portId] ?? ''
      : shape === 'item' && ['number', 'integer'].includes(base)
        ? inputDrafts[portId]
        : shape === 'item' && base === 'boolean'
          ? Boolean(inputDrafts[portId])
          : JSON.parse(inputJsonDrafts[portId] || 'null');
    const semantic = port.contract?.semantic || {};
    if (port.required && base === 'string' && typeof value === 'string' && !value.trim()) {
      throw new Error(t('processDesigner.graphInputInvalid'));
    }
    if (value === null && semantic.nullable !== true) {
      throw new Error(t('processDesigner.graphInputNullNotAllowed'));
    }
    if (value === undefined && port.required) {
      throw new Error(t('processDesigner.graphInputInvalid'));
    }
    const validItem = item => {
      if (item === null) return shape === 'item' && semantic.nullable === true;
      if (base === 'string') return typeof item === 'string';
      if (base === 'number') return typeof item === 'number' && Number.isFinite(item);
      if (base === 'integer') return Number.isSafeInteger(item);
      if (base === 'boolean') return typeof item === 'boolean';
      if (base === 'record') return item && typeof item === 'object' && !Array.isArray(item);
      return true;
    };
    const valid = value === null && semantic.nullable === true ? true : ['list', 'tuple', 'tree'].includes(shape)
      ? Array.isArray(value) && value.every(validItem)
      : shape === 'map'
        ? value && typeof value === 'object' && !Array.isArray(value)
        : validItem(value);
    if (!valid) throw new Error(t('processDesigner.graphInputInvalid'));
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

async function submitBake() {
  if (!canBake.value) return;
  emit('bake', {
    outputId: selectedOutputId.value,
    pageId: selectedPageId.value,
    path: pageFilePath.value.trim(),
    conflictPolicy: conflictPolicy.value,
    execution: props.execution
  });
}

onMounted(async () => {
  try {
    const response = await $fetch('/api/pages');
    const pages = (Array.isArray(response?.pages) ? response.pages : [])
      .filter(page => page?.kind === 'page' && page?._id);
    const byId = new Map(pages.map(page => [String(page._id), page]));
    pageOptions.value = pages.map(page => {
      const parts = [];
      const seen = new Set();
      let current = page;
      while (current && !seen.has(String(current._id))) {
        seen.add(String(current._id));
        parts.unshift(String(current.name || t('pages.page')));
        current = current.parentId ? byId.get(String(current.parentId)) : null;
      }
      return { _id: String(page._id), label: parts.join(' / ') };
    });
  } catch {
    pageOptions.value = [];
  }
});

function applyInput(port) {
  const portId = port.id;
  try {
    const base = port.contract?.semantic?.base || 'json';
    const shape = port.contract?.shape || 'item';
    const value = shape === 'item' && base === 'string'
      ? inputDrafts[portId] ?? ''
      : shape === 'item' && ['number', 'integer'].includes(base)
        ? inputDrafts[portId]
        : shape === 'item' && base === 'boolean'
          ? Boolean(inputDrafts[portId])
          : JSON.parse(inputJsonDrafts[portId] || 'null');
    const semantic = port.contract?.semantic || {};
    if (port.required && base === 'string' && typeof value === 'string' && !value.trim()) {
      throw new Error(t('processDesigner.graphInputInvalid'));
    }
    if (value === null && semantic.nullable !== true) {
      throw new Error(t('processDesigner.graphInputNullNotAllowed'));
    }
    if (value === undefined && port.required) {
      throw new Error(t('processDesigner.graphInputInvalid'));
    }
    const validItem = item => {
      if (item === null) return shape === 'item' && semantic.nullable === true;
      if (base === 'string') return typeof item === 'string';
      if (base === 'number') return typeof item === 'number' && Number.isFinite(item);
      if (base === 'integer') return Number.isSafeInteger(item);
      if (base === 'boolean') return typeof item === 'boolean';
      if (base === 'record') return item && typeof item === 'object' && !Array.isArray(item);
      return true;
    };
    const valid = value === null && semantic.nullable === true ? true : ['list', 'tuple', 'tree'].includes(shape)
      ? Array.isArray(value) && value.every(validItem)
      : shape === 'map'
        ? value && typeof value === 'object' && !Array.isArray(value)
        : validItem(value);
    if (!valid) throw new Error(t('processDesigner.graphInputInvalid'));
    delete inputErrors[portId];
    emit('update-input-binding', { portId, value });
  } catch (cause) {
    inputErrors[portId] = cause.message || String(cause);
  }
}
</script>
