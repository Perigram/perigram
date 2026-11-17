<template>
  <div class="flex h-full min-h-0 flex-1 flex-col">
    <StateBlock v-if="loading" state="loading" :message="$t('common.loading')" />
    <StateBlock v-else-if="loadError" :message="loadError" />
    <GraphCanvas
      v-else
      v-model:nodes="nodes"
      v-model:edges="edges"
      :bind-frame="bindCanvasFrame"
      :bind-context-palette-search="bindContextPaletteSearch"
      :document-items="[]"
      :canvas-items="canvasItems"
      chrome-variant="floating"
      :canvas-status="canvasStatus"
      :on-activity-click="openActivitySurface"
      :touch-pan-drag="touchPanDrag"
      :default-edge-options="{ type: 'default' }"
      :palette-groups="paletteGroups"
      :palette-placeholder="$t('processDesigner.searchOperations')"
      :context-palette="contextPalette"
      :context-palette-groups="contextPaletteGroups"
      :empty-message="$t('processDesigner.emptyGraph')"
      :validation="validation"
      :validation-diff-lines="[]"
      :selected-graph-nodes="selectedGraphNodes"
      :selected-node-id="selectedNodeId"
      :viewport="designerViewport"
      :frame-selected-nodes="frameSelectedNodes"
      :delete-graph-selection="deleteGraphSelection"
      :add-node="addNode"
      :add-context-node="addContextNode"
      :close-context-palette="closeContextPalette"
      :rename-declaration-node="renameDeclarationNode"
      :handle-designer-pointer-down="handleDesignerPointerDown"
      :handle-designer-focus="handleDesignerFocus"
      :handle-designer-wheel="handleDesignerWheel"
      :select-node="selectNode"
      :select-edge="selectEdge"
      :clear-graph-selection="clearGraphSelection"
      :open-pane-palette="openPanePalette"
      :begin-socket-connection="beginSocketConnection"
      :end-socket-connection="endSocketConnection"
      :on-connect="onConnect"
      :read-only="readOnly"
    >
      <template v-if="!readOnly" #inspector>
        <div class="flex h-full min-h-0 flex-col overflow-y-auto p-3">
          <GraphDocumentInspector
            :node="selectedNode"
            :boundary-declaration="selectedBoundaryDeclaration"
            :graph-documents="graphDocuments"
            :graph-documents-loading="graphDocumentsLoading"
            :graph-documents-error="graphDocumentsError"
            :graph-revisions="graphRevisions"
            :graph-revisions-loading="graphRevisionsLoading"
            :graph-revisions-error="graphRevisionsError"
            @update-config="updateNodeConfig"
            @update-boundary-label="updateBoundaryLabel"
            @update-boundary-declaration="updateBoundaryDeclaration"
            @select-graph-document="loadGraphRevisions"
            @hydrate-graph="hydrateSelectedGraph"
          />
        </div>
      </template>
      <template v-if="!readOnly" #support>
        <GraphDocumentPreviewPanel
          :result="previewResult"
          :execution="executionRecord"
          :error="previewError"
          :running="previewRunning"
          :graph="graphDocument"
          :input-bindings="inputBindings"
          :preview-renderers="previewRenderers"
          :node-definitions="nodeDefinitions"
          :channels="graphPreviewChannels"
          :can-bake-to-saved-graph="canBakeToSavedGraph"
          :baking="bakingOutput"
          @refresh="refreshPreviewAndRecord"
          @update-input-binding="setGraphInputBinding"
          @bake="bakeGraphOutput"
        />
      </template>
    </GraphCanvas>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import StateBlock from '~/components/shared/StateBlock.vue';
import GraphCanvas from '~/components/process-designer/GraphCanvas.vue';
import GraphDocumentInspector from '~/components/process-designer/GraphDocumentInspector.vue';
import GraphDocumentPreviewPanel from '~/components/process-designer/GraphDocumentPreviewPanel.vue';
import { useGraphDocumentSession } from '~/composables/useGraphDocumentSession.js';
import { mintId } from '~/utils/processDesignerIdentity.js';
import { assertValidGraphDocument } from '@perigram/core';
import { useClientEngines } from '~/composables/useClientEngines.js';
import { usePluginRuntime } from '~/composables/usePluginRuntime.js';

const props = defineProps({
  record: { type: Object, default: null },
  typeId: { type: String, default: 'graph-document' },
  persistence: { type: Object, required: true },
  mode: { type: String, default: 'edit' },
  pageChrome: { type: Object, default: null },
  nodeProviders: { type: Array, default: () => [] }
});

const { t } = useI18n();
const toast = useToast();
const readOnly = computed(() => props.mode === 'read');
const loading = ref(true);
const loadError = ref('');
const saving = ref(false);
const persisted = ref(Boolean(props.record?._id || props.record?.id));
const bakingOutput = ref(false);
const recordName = ref(props.record?.name || '');
const savedSignature = ref('');
const inspectTab = ref('inspector');
const graphDocuments = ref([]);
const clientEngineBindings = ref([]);
const clientEngines = useClientEngines({ engines: clientEngineBindings });
const clientRuntimeBindings = ref([]);
const pluginRuntime = usePluginRuntime({
  invokeCapability: ({ binding, runtime, operationId, name, input, signal }) => $fetch(
    `/api/organizations/${encodeURIComponent(binding.organizationId)}/plugins/${encodeURIComponent(binding.pluginId)}/capability`,
    {
      method: 'POST',
      signal,
      body: {
        version: binding.version,
        runtimeId: runtime.id,
        operationId,
        name,
        input
      }
    }
  )
});
const graphDocumentsLoading = ref(false);
const graphDocumentsError = ref('');
const graphPreviewChannels = ref([]);
const graphRevisions = ref([]);
const graphRevisionsLoading = ref(false);
const graphRevisionsError = ref('');
let canvasFrame = null;
let instanceId = String(props.record?._id || props.record?.id || '');

const queryOrganizationData = query => $fetch('/api/graph-executions/query', {
  method: 'POST',
  body: query
});
const session = useGraphDocumentSession({
  t,
  providers: props.nodeProviders,
  graphDocuments,
  finalizeExecution: pluginRuntime.finalizeExecution,
  queryOrganizationData
});
const {
  nodes,
  edges,
  graphDocument,
  validation,
  previewResult,
  executionRecord,
  inputBindings,
  previewError,
  previewRunning,
  paletteGroups,
  contextPaletteGroups,
  contextPaletteChipGroups,
  contextPalette,
  selectedNode,
  selectedBoundaryDeclaration,
  selectedNodeId,
  selectedGraphNodes,
  touchPanDrag,
  designerViewport,
  bindFrame,
  bindContextPaletteSearch,
  handleDesignerPointerDown,
  handleDesignerFocus,
  handleDesignerWheel,
  beginSocketConnection,
  endSocketConnection,
  frameSelectedNodes,
  frameAllNodes,
  zoomCanvasIn,
  zoomCanvasOut,
  resetCanvasZoom,
  deleteGraphSelection,
  addNode,
  addContextNode,
  closeContextPalette,
  openPanePalette,
  onConnect,
  selectNode,
  selectEdge,
  clearGraphSelection,
  updateNodeConfig,
  updateBoundaryLabel,
  updateBoundaryDeclaration,
  hydrateGraphInvocation,
  renameDeclarationNode,
  loadDocument,
  loadEmpty,
  serializeGraph,
  designerSignature,
  refreshPreview,
  setGraphInputBinding,
  registerNodeProvider
} = session;

// The server-rendered boot state is the initial saved baseline; async
// payload hydration may replace it on mount, but must not mark a new
// editor dirty before the first user edit.
savedSignature.value = designerSignature();

const canvasItems = computed(() => [
  { icon: 'pi pi-search-minus', label: t('drawing.zoomOut'), onClick: zoomCanvasOut },
  { icon: 'pi pi-search-plus', label: t('drawing.zoomIn'), onClick: zoomCanvasIn },
  { icon: 'pi pi-expand', label: t('processDesigner.frameAll'), onClick: frameAllNodes },
  { icon: 'pi pi-crosshairs', label: t('processDesigner.frameSelection'), onClick: frameSelectedNodes },
  { icon: 'pi pi-refresh', label: t('processDesigner.resetZoom'), onClick: resetCanvasZoom }
]);

const isDirty = computed(() => !readOnly.value
  && Boolean(graphDocument.value)
  && designerSignature() !== savedSignature.value);
const canBakeToSavedGraph = computed(() => Boolean(
  persisted.value && !isDirty.value
  && executionRecord.value?.graph?.id === graphDocument.value.id
  && executionRecord.value?.graph?.revision === graphDocument.value.revision
));

const canvasStatus = computed(() => {
  const evaluatedNodes = Object.keys(previewResult.value?.nodeOutputs || {});
  const state = previewRunning.value
    ? 'running'
    : previewError.value
      ? 'error'
      : previewResult.value
        ? 'ready'
        : 'idle';
  const suffix = state[0].toUpperCase() + state.slice(1);
  return {
    state,
    label: t(`processDesigner.canvasStatus${suffix}`),
    count: evaluatedNodes.length
  };
});

function bindCanvasFrame(instance) {
  canvasFrame = instance;
  bindFrame(instance);
}

function openActivitySurface() {
  canvasFrame?.openPanel?.('support');
}

function parseGraphPayload(payload) {
  const graph = JSON.parse(payload);
  if (!graph || typeof graph !== 'object' || Array.isArray(graph)) {
    throw new Error(t('processDesigner.invalidGraphPayload'));
  }
  return graph;
}

async function loadGraphCatalog() {
  graphDocumentsLoading.value = true;
  graphDocumentsError.value = '';
  try {
    const items = await $fetch('/api/instances/graph-document');
    graphDocuments.value = await Promise.all((Array.isArray(items) ? items : [])
      .filter(item => item?.payload?.fileId && item?._id)
      .map(async item => {
        const record = {
          ...item,
          _id: String(item._id),
          name: String(item.name || 'Graph'),
          fields: { ...(item.fields || {}), graphId: String(item.fields?.graphId || '') }
        };
        try {
          const payload = await $fetch(
            `/api/files/download/${encodeURIComponent(record.payload.fileId)}?bucket=files`,
            { responseType: 'text' }
          );
          const graph = assertValidGraphDocument(parseGraphPayload(payload));
          if (record.fields.graphId && record.fields.graphId !== graph.id) {
            throw new Error('Stored graph identity does not match its payload');
          }
          return { ...record, graph };
        } catch {
          return { ...record, graph: null };
        }
      }));
  } catch (error) {
    graphDocumentsError.value = error?.data?.message || error?.message || '';
  } finally {
    graphDocumentsLoading.value = false;
  }
}

async function loadGraphProviders() {
  try {
    const view = await $fetch('/api/admin/cts/types');
    clientEngineBindings.value = Array.isArray(view?.clientEngines) ? view.clientEngines : [];
    clientRuntimeBindings.value = Array.isArray(view?.clientRuntimes) ? view.clientRuntimes : [];
    graphPreviewChannels.value = Array.isArray(view?.previewChannels) ? view.previewChannels : [];
    const results = await Promise.allSettled(clientEngineBindings.value.map(async binding => {
      const engine = await clientEngines.engineFor(binding);
      if (engine.nodeProviders == null) return;
      if (!Array.isArray(engine.nodeProviders)) throw new Error(`Engine ${binding.pluginId} nodeProviders must be an array`);
      for (const contribution of engine.nodeProviders) registerNodeProvider(contribution, binding.pluginId);
    }));
    const runtimeResults = await Promise.allSettled(clientRuntimeBindings.value.map(async binding => {
      const contributions = await pluginRuntime.loadProviders(binding, binding.runtime);
      for (const contribution of contributions) registerNodeProvider(contribution, binding.pluginId);
    }));
    const failures = [...results, ...runtimeResults].filter(result => result.status === 'rejected');
    if (failures.length) {
      graphDocumentsError.value = [graphDocumentsError.value, failures.map(result => result.reason?.message || String(result.reason)).join('; ')].filter(Boolean).join(' · ');
    }
  } catch (error) {
    graphDocumentsError.value = [graphDocumentsError.value, error?.data?.message || error?.message || String(error)].filter(Boolean).join(' · ');
  }
}

onBeforeUnmount(() => pluginRuntime.dispose());

async function loadGraphRevisions(graphId) {
  graphRevisions.value = [];
  graphRevisionsError.value = '';
  if (!graphId) return;
  graphRevisionsLoading.value = true;
  try {
    const result = await $fetch('/api/instance-revisions', {
      query: { typeId: 'graph-document', instanceId: String(graphId), scope: 'content' }
    });
    graphRevisions.value = (Array.isArray(result) ? result : [])
      .map(revision => ({
        ...revision,
        _id: String(revision._id),
        label: `v${revision.data?.number ?? '?'} · ${String(revision.data?.createdAt || '').slice(0, 16)}`
      }))
      .sort((a, b) => Number(b.data?.number || 0) - Number(a.data?.number || 0));
  } catch (error) {
    graphRevisionsError.value = error?.data?.message || error?.message || '';
  } finally {
    graphRevisionsLoading.value = false;
  }
}

async function hydrateSelectedGraph({ nodeId, graphId, revisionId }) {
  const record = graphDocuments.value.find(item => String(item._id) === String(graphId));
  if (!record) return;
  try {
    const revision = graphRevisions.value.find(item => String(item._id) === String(revisionId));
    if (revisionId && !revision) throw new Error(t('processDesigner.selectGraphRevision'));
    const payload = revisionId
      ? await $fetch(`/api/instance-revisions/${encodeURIComponent(revisionId)}/file`, { responseType: 'text' })
      : await $fetch(`/api/files/download/${encodeURIComponent(record.payload.fileId)}?bucket=files`, { responseType: 'text' });
    const graph = parseGraphPayload(payload);
    hydrateGraphInvocation(nodeId, graph);
    toast.add({ severity: 'success', summary: t('processDesigner.graphPinned'), life: 2400 });
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: t('processDesigner.graphUnavailable'),
      detail: error?.data?.message || error?.message || '',
      life: 5000
    });
  }
}

async function loadGraphDocument() {
  loading.value = true;
  loadError.value = '';
  try {
    const payload = await props.persistence.load();
    if (payload) {
      loadDocument(parseGraphPayload(payload));
    } else {
      loadEmpty({
        id: instanceId || undefined,
        name: recordName.value
      });
    }
    savedSignature.value = designerSignature();
  } catch (error) {
    loadError.value = error?.data?.message || error?.message || t('processDesigner.invalidGraphPayload');
  } finally {
    loading.value = false;
  }
}

async function refreshPreviewAndRecord() {
  const result = await refreshPreview();
  if (executionRecord.value && instanceId && !isDirty.value && typeof props.persistence.recordExecution === 'function') {
    try {
      await props.persistence.recordExecution(executionRecord.value);
    } catch (error) {
      toast.add({
        severity: 'warn',
        summary: t('processDesigner.previewExecution'),
        detail: error?.data?.message || error?.message || String(error),
        life: 5000
      });
    }
  }
  return result;
}

async function bakeGraphOutput({ outputId, pageId, path, conflictPolicy, execution } = {}) {
  if (bakingOutput.value || readOnly.value || !persisted.value || isDirty.value) return;
  if (typeof props.persistence.bakeFile !== 'function') {
    toast.add({ severity: 'error', summary: t('processDesigner.bakeOutput'), detail: t('processDesigner.bakeUnavailable'), life: 5000 });
    return;
  }
  bakingOutput.value = true;
  try {
    const result = await props.persistence.bakeFile({
      graphDocumentInstanceId: instanceId,
      record: execution,
      outputId,
      destination: {
        type: 'page-file',
        pageId,
        path,
        conflictPolicy
      }
    });
    toast.add({
      severity: 'success',
      summary: t('processDesigner.bakeOutput'),
      detail: result?.file?.path || path,
      life: 4000
    });
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: t('processDesigner.bakeOutput'),
      detail: error?.data?.message || error?.message || String(error),
      life: 6000
    });
  } finally {
    bakingOutput.value = false;
  }
}

async function saveGraphDocument() {
  if (saving.value || readOnly.value) return;
  if (!validation.value.ok) {
    toast.add({
      severity: 'error',
      summary: t('processDesigner.invalidGraphPayload'),
      detail: validation.value.errors.join('; '),
      life: 6000
    });
    return;
  }
  saving.value = true;
  try {
    const name = String(recordName.value || props.record?.name || 'graph').trim() || 'graph';
    graphDocument.value.name = name;
    graphDocument.value.revision = mintId('rev').replaceAll('_', '-');
    const updated = await props.persistence.save(
      JSON.stringify(serializeGraph(), null, 2),
      `${name}.json`
    );
    instanceId = String(updated?._id || updated?.id || instanceId);
    persisted.value = Boolean(instanceId);
    if (updated?.name) recordName.value = updated.name;
    savedSignature.value = designerSignature();
    await refreshPreviewAndRecord();
    toast.add({ severity: 'success', summary: t('processDesigner.saved'), life: 2400 });
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: t('common.save'),
      detail: error?.data?.message || error?.message || '',
      life: 5000
    });
  } finally {
    saving.value = false;
  }
}

async function renameGraphDocument(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return;
  if (!instanceId) {
    recordName.value = trimmed;
    graphDocument.value.name = trimmed;
    return;
  }
  try {
    const updated = await props.persistence.rename(trimmed);
    recordName.value = updated?.name || trimmed;
    graphDocument.value.name = recordName.value;
    savedSignature.value = designerSignature();
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: t('common.rename'),
      detail: error?.data?.message || error?.message || '',
      life: 4000
    });
  }
}

props.pageChrome?.bind?.(Object.assign(
  reactive({
    name: computed(() => recordName.value),
    dirty: isDirty,
    saving,
    diverged: false
  }),
  readOnly.value ? {} : { save: saveGraphDocument, rename: renameGraphDocument }
));

onMounted(async () => {
  await Promise.all([loadGraphDocument(), loadGraphCatalog(), loadGraphProviders()]);
});
</script>
