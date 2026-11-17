<template>
  <div class="flex min-h-0 flex-col gap-3 overflow-y-auto p-3">
    <div class="flex items-center justify-between gap-2">
      <span class="text-label">{{ $t('processDesigner.graphOutputs') }}</span>
      <Button icon="pi pi-refresh" size="small" text :loading="running" :aria-label="$t('processDesigner.refreshPreview')" @click="$emit('refresh')" />
    </div>
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
      <div v-if="execution" class="text-supporting text-muted">{{ $t('processDesigner.previewExecution') }} · {{ execution.status }} · {{ execution.id }}</div>
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
        <PreviewChannelMount
          v-if="activeView.startsWith('channel:') && activeChannel"
          :channel="activeChannel"
          :payload="channelPayload"
        />
        <img
          v-else-if="activeView === 'image' && imageUrl"
          :src="imageUrl"
          :alt="selectedValue?.name || selectedOutput?.label || 'Graph output'"
          class="max-h-[32rem] max-w-full object-contain"
        />
        <svg
          v-else-if="activeView === 'scene-2d'"
          :viewBox="scene2dViewBox"
          class="h-80 w-full"
          role="img"
          :aria-label="selectedOutput?.label || '2D scene'"
        >
          <g v-for="(primitive, index) in selectedValue.primitives" :key="index" fill="none" stroke="currentColor" stroke-width="1.5">
            <line v-if="primitive.type === 'line'" :x1="primitive.x1" :y1="primitive.y1" :x2="primitive.x2" :y2="primitive.y2" />
            <polyline v-else-if="primitive.type === 'polyline'" :points="svgPoints(primitive.points)" />
            <polygon v-else-if="primitive.type === 'polygon'" :points="svgPoints(primitive.points)" />
            <circle v-else-if="primitive.type === 'circle'" :cx="primitive.cx" :cy="primitive.cy" :r="primitive.r" />
            <rect v-else-if="primitive.type === 'rect'" :x="primitive.x" :y="primitive.y" :width="primitive.width" :height="primitive.height" />
            <text v-else-if="primitive.type === 'text'" :x="primitive.x" :y="primitive.y" fill="currentColor" stroke="none">{{ primitive.text }}</text>
          </g>
        </svg>
        <svg
          v-else-if="activeView === 'scene-3d'"
          viewBox="0 0 800 500"
          class="h-80 w-full"
          role="img"
          :aria-label="selectedOutput?.label || '3D scene'"
        >
          <polygon v-for="(face, index) in scene3d.faces" :key="`f${index}`" :points="face" fill="currentColor" fill-opacity="0.08" stroke="currentColor" stroke-opacity="0.35" />
          <line v-for="(edge, index) in scene3d.edges" :key="`e${index}`" :x1="edge.x1" :y1="edge.y1" :x2="edge.x2" :y2="edge.y2" stroke="currentColor" stroke-width="1.5" />
        </svg>
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
    <section v-if="result && outputOptions.length" class="flex flex-col gap-2 border-t border-surface pt-3">
      <strong class="text-supporting">{{ $t('processDesigner.bakeOutput') }}</strong>
      <label class="text-supporting text-muted" for="graph-bake-page">{{ $t('processDesigner.pageDestination') }}</label>
      <InstanceSelect
        id="graph-bake-page"
        v-model="selectedPageId"
        :options="pageOptions"
        option-label="label"
        option-value="_id"
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
  channels: { type: Array, default: () => [] }
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
const imageUrl = computed(() => {
  const value = selectedValue.value;
  return value?.fileId && String(value.mime || '').startsWith('image/')
    ? `/api/files/download/${encodeURIComponent(value.fileId)}?bucket=${encodeURIComponent(value.bucket || 'files')}`
    : '';
});
const scene2dViewBox = computed(() => {
  const bounds = selectedValue.value?.bounds || { x: 0, y: 0, width: 100, height: 100 };
  return `${Number(bounds.x || 0)} ${Number(bounds.y || 0)} ${Math.max(1, Number(bounds.width || 100))} ${Math.max(1, Number(bounds.height || 100))}`;
});
const scene3d = computed(() => {
  const vertices = Array.isArray(selectedValue.value?.vertices) ? selectedValue.value.vertices : [];
  if (!vertices.length) return { faces: [], edges: [] };
  const projected = vertices.map(vertex => {
    const [x = 0, y = 0, z = 0] = (Array.isArray(vertex) ? vertex : []).map(Number);
    return { x: (x - y) * 0.8660254, y: (x + y) * 0.5 - z };
  });
  const xs = projected.map(point => point.x), ys = projected.map(point => point.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = Math.min(720 / Math.max(1, maxX - minX), 420 / Math.max(1, maxY - minY));
  const points = projected.map(point => ({ x: 400 + (point.x - (minX + maxX) / 2) * scale, y: 250 - (point.y - (minY + maxY) / 2) * scale }));
  const faces = (selectedValue.value.faces || []).filter(face => Array.isArray(face) && face.length >= 3 && face.every(index => Number.isInteger(index) && points[index])).map(face => face.map(index => `${points[index].x},${points[index].y}`).join(' '));
  const edgePairs = Array.isArray(selectedValue.value.edges) && selectedValue.value.edges.length
    ? selectedValue.value.edges
    : (selectedValue.value.faces || []).flatMap(face => face.map((index, position) => [index, face[(position + 1) % face.length]]));
  const edges = edgePairs.filter(edge => Array.isArray(edge) && edge.length === 2 && points[edge[0]] && points[edge[1]]).map(([a, b]) => ({ x1: points[a].x, y1: points[a].y, x2: points[b].x, y2: points[b].y }));
  return { faces, edges };
});
const activeChannel = computed(() => props.channels.find(channel => `channel:${channel.id}` === activeView.value) || null);
const channelPayload = computed(() => ({
  ...props.result,
  graph: props.graph,
  execution: props.execution,
  selectedOutput: selectedOutput.value ? { id: selectedOutput.value.id, label: selectedOutput.value.label, value: selectedValue.value } : null
}));
const availableViews = computed(() => {
  const value = selectedValue.value;
  const views = [{ value: 'json', label: 'JSON' }];
  if (rendererForOutput.value) views.unshift({ value: 'plugin', label: 'Specialized' });
  if (typeof value === 'string') views.unshift({ value: 'text', label: 'Text' }, { value: 'markdown', label: 'Markdown' });
  if (Array.isArray(value) && value.length && value.every(item => item && typeof item === 'object' && !Array.isArray(item))) {
    views.unshift({ value: 'table', label: 'Table' });
  }
  if (value && typeof value === 'object' && value.fileId) {
    if (String(value.mime || '').startsWith('image/')) views.unshift({ value: 'image', label: 'Image' });
    else views.unshift({ value: 'document', label: 'Document' });
  }
  if (value?.representation === 'perigram.scene-2d' && Array.isArray(value.primitives)) views.unshift({ value: 'scene-2d', label: '2D scene' });
  if (value?.representation === 'perigram.scene-3d' && Array.isArray(value.vertices)) views.unshift({ value: 'scene-3d', label: '3D scene' });
  for (const channel of props.channels) views.push({ value: `channel:${channel.id}`, label: channel.label });
  return views;
});
const tableColumns = computed(() => [...new Set((Array.isArray(selectedValue.value) ? selectedValue.value : []).flatMap(row => Object.keys(row || {})))]);
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
  if (!options.some(option => option._id === selectedOutputId.value)) selectedOutputId.value = options[0]?._id || '';
}, { immediate: true });
watch(availableViews, views => {
  const value = selectedValue.value;
  const documentsChannel = props.channels.find(channel => channel.id === 'documents');
  const isDocument = ['text.flow-document', 'document.report'].includes(value?.type)
    || ['text/markdown', 'text/html', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(value?.payload?.mime);
  const preferred = isDocument && documentsChannel ? `channel:${documentsChannel.id}` : '';
  if (preferred && views.some(view => view.value === preferred)) activeView.value = preferred;
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

function svgPoints(points = []) {
  return Array.isArray(points) ? points.filter(point => Array.isArray(point) && point.length >= 2).map(point => `${Number(point[0])},${Number(point[1])}`).join(' ') : '';
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
      return { _id: String(page._id), label: `${parts.join(' / ')} · ${String(page._id)}` };
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
function format(value) {
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}
function nodeLabel(id) {
  const node = props.graph.nodes?.find(item => item.id === id);
  return node?.operation?.id || id;
}
</script>
