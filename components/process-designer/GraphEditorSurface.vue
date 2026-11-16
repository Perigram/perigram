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
        <div class="flex h-full min-h-0 flex-col">
          <Tabs v-model:value="inspectTab" class="flex min-h-0 flex-1 flex-col">
            <TabList>
              <Tab value="inspector">{{ $t('processDesigner.inspector') }}</Tab>
              <Tab value="preview">{{ $t('processDesigner.previewTab') }}</Tab>
            </TabList>
            <TabPanels class="min-h-0 flex-1 overflow-y-auto">
              <TabPanel value="inspector">
                <GraphDocumentInspector
                  :node="selectedNode"
                  @update-config="updateNodeConfig"
                  @update-boundary-label="updateBoundaryLabel"
                />
              </TabPanel>
              <TabPanel value="preview">
                <GraphDocumentPreviewPanel
                  :result="previewResult"
                  :error="previewError"
                  :running="previewRunning"
                  :graph="graphDocument"
                  :input-bindings="inputBindings"
                  @refresh="refreshPreview"
                  @update-input-binding="setGraphInputBinding"
                />
              </TabPanel>
            </TabPanels>
          </Tabs>
        </div>
      </template>
    </GraphCanvas>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import Tab from 'primevue/tab';
import TabList from 'primevue/tablist';
import TabPanel from 'primevue/tabpanel';
import TabPanels from 'primevue/tabpanels';
import Tabs from 'primevue/tabs';
import StateBlock from '~/components/shared/StateBlock.vue';
import GraphCanvas from '~/components/process-designer/GraphCanvas.vue';
import GraphDocumentInspector from '~/components/process-designer/GraphDocumentInspector.vue';
import GraphDocumentPreviewPanel from '~/components/process-designer/GraphDocumentPreviewPanel.vue';
import { useGraphDocumentSession } from '~/composables/useGraphDocumentSession.js';
import { mintId } from '~/utils/processDesignerIdentity.js';

const props = defineProps({
  record: { type: Object, default: null },
  typeId: { type: String, default: 'graph-document' },
  persistence: { type: Object, required: true },
  mode: { type: String, default: 'edit' },
  pageChrome: { type: Object, default: null }
});

const { t } = useI18n();
const toast = useToast();
const readOnly = computed(() => props.mode === 'read');
const loading = ref(true);
const loadError = ref('');
const saving = ref(false);
const recordName = ref(props.record?.name || '');
const savedSignature = ref('');
const inspectTab = ref('inspector');
let canvasFrame = null;
let instanceId = String(props.record?._id || props.record?.id || '');

const session = useGraphDocumentSession({ t });
const {
  nodes,
  edges,
  graphDocument,
  validation,
  previewResult,
  inputBindings,
  previewError,
  previewRunning,
  paletteGroups,
  contextPaletteGroups,
  contextPaletteChipGroups,
  contextPalette,
  selectedNode,
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
  renameDeclarationNode,
  loadDocument,
  loadEmpty,
  serializeGraph,
  designerSignature,
  refreshPreview,
  setGraphInputBinding
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
  canvasFrame?.openPanel?.('inspector');
  inspectTab.value = 'preview';
}

function parseGraphPayload(payload) {
  const graph = JSON.parse(payload);
  if (!graph || typeof graph !== 'object' || Array.isArray(graph)) {
    throw new Error(t('processDesigner.invalidGraphPayload'));
  }
  return graph;
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

async function saveGraphDocument() {
  if (saving.value || readOnly.value) return;
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
    if (!props.record?._id && recordName.value && recordName.value !== updated?.name) {
      const renamed = await props.persistence.rename(recordName.value);
      recordName.value = renamed?.name || recordName.value;
    } else if (updated?.name) {
      recordName.value = updated.name;
    }
    savedSignature.value = designerSignature();
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

onMounted(loadGraphDocument);
</script>
