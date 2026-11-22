<template>
  <div class="flex h-full min-h-0 flex-1 flex-col">
    <StateBlock v-if="!props.session && loading" state="loading" :message="$t('common.loading')" />
    <StateBlock v-else-if="!props.session && loadError" :message="loadError" />
    <GraphCanvas
      v-else
      v-model:nodes="nodes"
      v-model:edges="edges"
      :bind-frame="bindCanvasFrame"
      :bind-canvas-pane="bindCanvasPane"
      :bind-context-palette-search="bindContextPaletteSearch"
      :canvas-items="activeCanvasItems"
      :chrome="activeChrome"
      :touch-pan-drag="touchPanDrag"
      :default-edge-options="{ type: 'default' }"
      :palette-groups="paletteGroups"
      :palette-placeholder="palettePlaceholder || $t('processDesigner.searchOperations')"
      :context-palette="contextPalette"
      :context-palette-groups="contextPaletteGroups"
      :empty-message="emptyMessage || $t('processDesigner.emptyGraph')"
      :validation="validation"
      :validation-diff-lines="validationDiffLines"
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
      :handle-node-drag-stop="nodeDragStop"
      :handle-canvas-nodes-change="canvasNodesChange"
      :read-only="readOnly"
    >
      <template #lane><slot name="lane" /></template>
      <template v-if="!readOnly" #inspector>
        <slot v-if="$slots.inspector" name="inspector" />
        <div v-else class="flex h-full min-h-0 flex-col overflow-y-auto p-3">
          <GraphDocumentInspector
            :node="selectedNode"
            :type-options="graphTypeOptions"
            :node-output="previewResult?.nodeOutputs?.[selectedNode?.id] || null"
            :boundary-declaration="selectedBoundaryDeclaration"
            :graph-documents="graphDocuments"
            :graph-documents-loading="graphDocumentsLoading"
            :graph-documents-error="graphDocumentsError"
            :consumer-graphs="graphConsumers"
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
      <template v-if="!readOnly" #preview>
        <slot v-if="$slots.preview" name="preview" />
        <GraphDocumentPreviewPanel
          v-else-if="!props.session"
          :result="previewResult"
          :execution="executionRecord"
          :error="previewError"
          :running="previewRunning"
          :graph="graphDocument"
          :input-bindings="inputBindings"
          :preview-renderers="previewRenderers"
          :node-definitions="nodeDefinitions"
          :channels="graphPreviewChannels"
          :provider-errors="providerErrors"
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
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import StateBlock from '~/components/shared/StateBlock.vue';
import GraphCanvas from '~/components/process-designer/GraphCanvas.vue';
import GraphDocumentInspector from '~/components/process-designer/GraphDocumentInspector.vue';
import GraphDocumentPreviewPanel from '~/components/process-designer/GraphDocumentPreviewPanel.vue';
import { useGraphDocumentSession } from '~/composables/useGraphDocumentSession.js';
import { parseGraphPayload, useGraphDocumentCatalog } from '~/composables/useGraphDocumentCatalog.js';
import { graphInvocationConsumers } from '~/utils/graphInvocation.js';
import { mintId } from '~/utils/processDesignerIdentity.js';
import { GRAPH_DOCUMENT_EXTENSION } from '#packages/cts';
import { useClientEngines } from '~/composables/useClientEngines.js';
import { usePluginRuntime } from '~/composables/usePluginRuntime.js';
import {
  PROCESS_NODE_CATALOG,
  PROCESS_PROCEDURAL_PROVIDER,
  createProcessGraphNodeDefinition,
  createProcessGraphNodeResolver,
  createProcessProceduralNodeResolver,
  createProcessProceduralExecutor,
  genericPaletteItemForKind,
  registerProcessPortCompatibilityProfile
} from '#packages/processes';
import { createPaletteText } from '~/utils/processDesignerPaletteText.js';

const props = defineProps({
  record: { type: Object, default: null },
  typeId: { type: String, default: 'graph-document' },
  persistence: { type: Object, default: null },
  mode: { type: String, default: 'edit' },
  pageChrome: { type: Object, default: null },
  chromeOverride: { type: Object, default: null },
  nodeProviders: { type: Array, default: () => [] },
  session: { type: Object, default: null },
  canvasItems: { type: Array, default: null },
  palettePlaceholder: { type: String, default: '' },
  emptyMessage: { type: String, default: '' },
  validationDiffLines: { type: Array, default: () => [] },
  nodeDragStop: { type: Function, default: null },
  canvasNodesChange: { type: Function, default: null }
});

const emit = defineEmits(['preview-visibility']);

const { t, te } = useI18n();
const toast = useToast();
const readOnly = computed(() => props.mode === 'read');
const { paletteLabel, paletteDescription } = createPaletteText({ t, te });
// The process provider's graph rows read the process palette vocabulary:
// one concept one label in both editors (the kind's generic palette item).
function processDefinitionText(definition) {
  if (definition?.provider !== PROCESS_PROCEDURAL_PROVIDER) return null;
  const item = genericPaletteItemForKind(definition.id);
  return item ? { label: paletteLabel(item), description: paletteDescription(item) } : null;
}

// Installed plugin display names (the listing `name`): one per pluginId
// across engine and runtime bindings.
const pluginDisplayNames = computed(() => {
  const names = {};
  for (const binding of [...clientEngineBindings.value, ...clientRuntimeBindings.value]) {
    if (binding?.pluginId && binding.name) names[binding.pluginId] = binding.name;
  }
  return names;
});
const loading = ref(true);
const loadError = ref('');
const saving = ref(false);
const persisted = ref(Boolean(props.record?._id || props.record?.id));
const bakingOutput = ref(false);
const recordName = ref(props.record?.name || '');
const savedSignature = ref('');
const inspectTab = ref('inspector');
const clientEngineBindings = ref([]);
const clientEngines = useClientEngines({ engines: clientEngineBindings });
const clientRuntimeBindings = ref([]);
const {
  documents: graphDocuments,
  loading: graphDocumentsLoading,
  error: graphDocumentsError,
  load: loadGraphCatalog
} = useGraphDocumentCatalog({ withPayloads: true });
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
const graphPreviewChannels = ref([]);
const graphTypeOptions = ref([]);
const providerErrors = ref([]);
const graphRevisions = ref([]);
const graphRevisionsLoading = ref(false);
const graphRevisionsError = ref('');
let instanceId = String(props.record?._id || props.record?.id || '');const processNodeDefinitions = PROCESS_NODE_CATALOG
  .map(catalog => createProcessGraphNodeDefinition(catalog.kind, { kind: catalog.kind }))
  .filter(Boolean);
const processGraphResolver = createProcessGraphNodeResolver();
const processPreviewResolver = createProcessProceduralNodeResolver();
const processExecutor = createProcessProceduralExecutor();

const queryOrganizationData = query => $fetch('/api/graph-executions/query', {
  method: 'POST',
  body: query
});
const defaultSession = props.session ? null : useGraphDocumentSession({
  t,
  te,
  providers: props.nodeProviders,
  definitions: processNodeDefinitions,
  nodeResolvers: [processGraphResolver],
  previewResolvers: [processPreviewResolver],
  compatibilityProfiles: [registerProcessPortCompatibilityProfile],
  frameworkProviders: [PROCESS_PROCEDURAL_PROVIDER],
  executors: { [PROCESS_PROCEDURAL_PROVIDER]: processExecutor },
  graphDocuments,
  finalizeExecution: pluginRuntime.finalizeExecution,
  queryOrganizationData,
  definitionText: processDefinitionText,
  pluginNames: pluginDisplayNames
});
const session = props.session || defaultSession;
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
  draftSignature,
  refreshPreview,
  setGraphInputBinding,
  registerNodeProvider
} = session;

// The server-rendered boot state is the initial saved baseline; async
// payload hydration may replace it on mount, but must not mark a new
// editor dirty before the first user edit.
if (typeof draftSignature === 'function' && graphDocument?.value) savedSignature.value = draftSignature();

const defaultCanvasItems = computed(() => [
  { icon: 'pi pi-search-minus', label: t('drawing.zoomOut'), onClick: zoomCanvasOut },
  { icon: 'pi pi-search-plus', label: t('drawing.zoomIn'), onClick: zoomCanvasIn },
  { icon: 'pi pi-expand', label: t('processDesigner.frameAll'), onClick: frameAllNodes },
  { icon: 'pi pi-crosshairs', label: t('processDesigner.frameSelection'), onClick: frameSelectedNodes },
  { icon: 'pi pi-refresh', label: t('processDesigner.resetZoom'), onClick: resetCanvasZoom }
]);
const activeCanvasItems = computed(() => props.canvasItems || defaultCanvasItems.value);

// The dirty check compares the persisted draft shape: one pass over the
// canvas with no graph normalization, so no drag frame re-validates the
// graph.
const dirty = computed(() => !readOnly.value
  && Boolean(graphDocument?.value)
  && draftSignature() !== savedSignature.value);
function markSaved(signature = draftSignature()) {
  savedSignature.value = signature;
}
const graphConsumers = computed(() => graphInvocationConsumers(
  graphDocuments.value,
  String(graphDocument?.value?.id || '')
));
const canBakeToSavedGraph = computed(() => Boolean(
  persisted.value && !dirty.value
  && executionRecord?.value?.graph?.id === graphDocument?.value?.id
  && executionRecord?.value?.graph?.revision === graphDocument?.value?.revision
));

// The workspace frame must be a ref: the preview-region watch tracks
// `canvasFrame.value.panels` reactively.
const canvasFrame = ref(null);

function bindCanvasFrame(instance) {
  canvasFrame.value = instance;
}

// The session's geometry frame binds to the canvas pane element — the
// box every canvas coordinate resolves against.
function bindCanvasPane(element) {
  bindFrame(element);
}

watch(() => canvasFrame.value?.panels?.preview, open => {
  emit('preview-visibility', Boolean(open));
});

function providerLoadFailure(binding, error, contribution = null) {
  return {
    pluginId: String(binding?.pluginId || 'unknown'),
    runtimeId: String(binding?.runtime?.id || binding?.engineId || ''),
    provider: String(contribution?.provider || ''),
    operations: Array.isArray(contribution?.definitions)
      ? contribution.definitions.map(definition => String(definition?.id || '')).filter(Boolean)
      : [],
    message: error?.message || String(error)
  };
}

async function loadGraphProviders() {
  providerErrors.value = [];
  try {
    const view = await $fetch('/api/admin/cts/types');
    clientEngineBindings.value = Array.isArray(view?.clientEngines) ? view.clientEngines : [];
    clientRuntimeBindings.value = Array.isArray(view?.clientRuntimes) ? view.clientRuntimes : [];
    graphPreviewChannels.value = Array.isArray(view?.previewChannels) ? view.previewChannels : [];
    graphTypeOptions.value = (Array.isArray(view?.types) ? view.types : [])
      .map(type => ({ label: type.name || type.label || type.id, value: type.id }))
      .filter(option => option.value);
    const failures = [];
    const engineResults = await Promise.allSettled(clientEngineBindings.value.map(async binding => {
      const engine = await clientEngines.engineFor(binding);
      if (engine.nodeProviders == null) return;
      if (!Array.isArray(engine.nodeProviders)) throw new Error(`Engine ${binding.pluginId} nodeProviders must be an array`);
      for (const contribution of engine.nodeProviders) {
        try {
          registerNodeProvider(contribution, binding.pluginId);
        } catch (error) {
          failures.push(providerLoadFailure(binding, error, contribution));
        }
      }
    }));
    engineResults.forEach((result, index) => {
      if (result.status === 'rejected') {
        failures.push(providerLoadFailure(clientEngineBindings.value[index], result.reason));
      }
    });
    const runtimeResults = await Promise.allSettled(clientRuntimeBindings.value.map(async binding => {
      const loaded = await pluginRuntime.loadProvidersDetailed(binding, binding.runtime);
      failures.push(...loaded.errors);
      for (const contribution of loaded.providers) {
        try {
          registerNodeProvider(contribution, binding.pluginId);
        } catch (error) {
          failures.push(providerLoadFailure(binding, error, contribution));
        }
      }
    }));
    runtimeResults.forEach((result, index) => {
      if (result.status === 'rejected') {
        failures.push(providerLoadFailure(clientRuntimeBindings.value[index], result.reason));
      }
    });
    providerErrors.value = failures;
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
    const graph = parseGraphPayload(payload, t);
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
      loadDocument(parseGraphPayload(payload, t));
    } else {
      loadEmpty({
        id: instanceId || undefined,
        name: recordName.value
      });
    }
    markSaved();
  } catch (error) {
    loadError.value = error?.data?.message || error?.message || t('processDesigner.invalidGraphPayload');
  } finally {
    loading.value = false;
  }
}

async function refreshPreviewAndRecord() {
  const result = await refreshPreview();
  if (executionRecord.value && instanceId && !dirty.value && typeof props.persistence.recordExecution === 'function') {
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
  if (bakingOutput.value || readOnly.value || !persisted.value || dirty.value) return;
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
    const submitted = serializeGraph();
    const submittedSignature = draftSignature();
    const updated = await props.persistence.save(
      JSON.stringify(submitted, null, 2),
      `${name}${GRAPH_DOCUMENT_EXTENSION}`
    );
    instanceId = String(updated?._id || updated?.id || instanceId);
    persisted.value = Boolean(instanceId);
    if (updated?.name) recordName.value = updated.name;
    markSaved(submittedSignature);
    await loadGraphCatalog(t);
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
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: t('common.rename'),
      detail: error?.data?.message || error?.message || '',
      life: 4000
    });
  }
}

// The editor-page chrome api (SPEC §4): the workspace file panel renders
// it — name with in-place rename, dirty-marked save — and a host channel
// (the graphs list's active-document rename) binds the same api.
const chromeApi = Object.assign(
  reactive({
    name: computed(() => recordName.value),
    instanceId: computed(() => instanceId),
    dirty,
    saving,
    diverged: false
  }),
  readOnly.value ? {} : { save: saveGraphDocument, rename: renameGraphDocument }
);
props.pageChrome?.bind?.(chromeApi);
const activeChrome = computed(() => props.chromeOverride || chromeApi);

onMounted(async () => {
  if (props.session) return;
  await Promise.all([loadGraphDocument(), loadGraphCatalog(t), loadGraphProviders()]);
  // A preview requested while the provider workers were still loading
  // resolves again once every registered operation is available.
  if (previewResult.value || previewError.value) await refreshPreviewAndRecord();
});
</script>
