<template>
  <div class="flex h-full min-h-0 flex-1 flex-col">
    <StateBlock v-if="loading" state="loading" :message="$t('common.loading')" />
    <StateBlock v-else-if="loadError" :message="loadError" />
    <GraphCanvas
      v-else
      v-model:nodes="nodes"
      v-model:edges="edges"
      :bind-frame="instance => { canvasFrame = instance }"
      :bind-context-palette-search="instance => { contextPaletteSearch = instance }"
      :document-items="[]"
      :canvas-items="canvasDockItems"
      :touch-pan-drag="touchPanDrag"
      :default-edge-options="{ type: 'default' }"
      :palette-groups="paletteChipGroups"
      :palette-placeholder="$t('processDesigner.searchOperations')"
      :context-palette="contextPalette"
      :context-palette-groups="contextPaletteChipGroups"
      :empty-message="$t('processDesigner.emptyGraph')"
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
      :read-only="mode === 'read'"
    >
      <template v-if="mode !== 'read'" #inspector>
        <div class="flex h-full min-h-0 flex-col">
          <Tabs v-model:value="inspectTab" class="flex min-h-0 flex-1 flex-col">
            <TabList>
              <Tab value="inspector">{{ $t('processDesigner.inspector') }}</Tab>
              <Tab value="preview">{{ $t('processDesigner.previewTab') }}</Tab>
            </TabList>
            <TabPanels class="min-h-0 flex-1 overflow-y-auto">
              <TabPanel value="inspector">
                <GraphInspector
                  :selected-node="selectedNode"
                  :selected-process-node="selectedProcessNode"
                  :selected-entity="selectedEntity"
                  :selected-entity-available="selectedEntityAvailable"
                  :selected-declaration-edge="selectedDeclarationEdge"
                  :declaration-node-types="declarationNodeTypes"
                  :class-type-id-valid="classTypeIdValid"
                  :class-declaration-diagnostics="classDeclarationDiagnostics"
                  :declaration-type-options="declarationTypeOptions"
                  :type-anchor-options="typeAnchorOptions"
                  :class-identifier-field="classIdentifierField"
                  :relation-options-for-entity="relationOptionsForEntity"
                  :projection-options-for-entity="projectionOptionsForEntity"
                  :type-id-options="typeIdOptions"
                  :role-options="roleOptions"
                  :command-options="commandOptions"
                  :selected-command-service="selectedCommandService"
                  :service-principal-options="servicePrincipalOptions"
                  :transition-guard-field-options="transitionGuardFieldOptions"
                  :record-state-policy-target="recordStatePolicyTarget"
                  :record-state-field-policy-options="recordStateFieldPolicyOptions"
                  :construction-modes="selectedConstructionModes"
                  :designer="designer"
                  :grants="selectedProcessNodeGrants"
                  :effective-access="selectedProcessNodeEffectiveAccess"
                  :inputs="selectedNode?.type === 'processNode' ? processNodeInputs(selectedProcessNode) : []"
                  :preview="inspectorPreview"
                  :format-preview-path="formatPreviewPath"
                  :format-preview-items="formatPreviewItems"
                  @sync="syncNodeData"
                  @update-name="value => updateClassName(selectedNode, value)"
                  @update-identifier-field="value => setClassIdentifierField(selectedNode, value)"
                  @update-grant-level="({ index, level }) => updateSelectedProcessNodeGrantLevel(index, level)"
                  @update-construction-mode="value => updateProcessNodeConstructionMode(selectedProcessNode, value)"
                  @run-preview="previewDataflow"
                  @create-command-service="createCommandServiceForSelectedNode"
                  @remove-command-service="removeSelectedCommandService"
                />
              </TabPanel>
              <TabPanel value="preview">
                <GraphPreviewPanel
                  :channels="servedPreviewChannels"
                  :payload="channelPreview.payload.value"
                  :nodes="nodes"
                  :running="channelPreview.running.value"
                  :error="channelPreview.error.value"
                  @refresh="channelPreview.run"
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
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import Tab from 'primevue/tab';
import TabList from 'primevue/tablist';
import TabPanel from 'primevue/tabpanel';
import TabPanels from 'primevue/tabpanels';
import Tabs from 'primevue/tabs';
import StateBlock from '~/components/shared/StateBlock.vue';
import GraphCanvas from '~/components/process-designer/GraphCanvas.vue';
import GraphInspector from '~/components/process-designer/GraphInspector.vue';
import GraphPreviewPanel from '~/components/process-designer/GraphPreviewPanel.vue';
import { useAuthStore } from '~/stores/auth';
import { useProcessDesignerGraphSession } from '~/composables/useProcessDesignerGraphSession.js';
import { useProcessDesignerPersistence } from '~/composables/useProcessDesignerPersistence.js';
import { useProcessDesignerRoles } from '~/composables/useProcessDesignerRoles.js';
import { useGraphChannelPreview } from '~/composables/useGraphChannelPreview.js';
import { canvasToDefinition, PROCESS_DATAFLOW_VERSION } from '~/packages/processes/src/index.js';

// The graph editor surface (SPEC §28): the graph canvas session mounted
// over a `graph-document` payload — the same authoring core the process
// designer page rides. The document lifecycle is payload-based: the
// payload text is the serialized graph data object, the save writes it
// through the instance payload transport (blank-create on the first
// save), and the header chrome channel carries the name, save, and
// dirty state. A read grant mounts the canvas alone.
const props = defineProps({
  record: { type: Object, default: null },
  typeId: { type: String, default: 'graph-document' },
  persistence: { type: Object, required: true },
  mode: { type: String, default: 'edit' },
  pageChrome: { type: Object, default: null }
});

const { t, te } = useI18n();
const toast = useToast();
const authStore = useAuthStore();

const readOnly = computed(() => props.mode === 'read');
const loading = ref(true);
const loadError = ref('');
const saving = ref(false);
const savedSignature = ref('');
const recordName = ref(props.record?.name || '');
const inspectTab = ref('inspector');
const organizationRoles = ref({});
const draft = ref(null);

function activeOrganizationId() {
  return draft.value?.lineage?.organizationId
    || authStore.organizationData?._id
    || authStore.userData?.organizationId
    || authStore.memberships?.[0]?.organizationId
    || null;
}

const rolePersistence = useProcessDesignerRoles();
// The graph preview seam rides the process-definition preview
// transport; every other save/load verb belongs to the instance
// payload persistence the registry hands in.
const previewTransport = useProcessDesignerPersistence();
const graphPersistence = { ...props.persistence, previewDraft: previewTransport.previewDraft };

const channelPreview = useGraphChannelPreview({
  persistence: graphPersistence,
  serializeProcess: () => serializeProcess(),
  clientEngines: () => ({ engines: servedClientEngines.value, domain: ctsProjectedDomain() })
});

const {
  nodes,
  edges,
  validation,
  secondaryHidden,
  draftDataSignature,
  designerSignature,
  loadDocument,
  serializeProcess,
  designer,
  ctsTypeView,
  loadOrgTypes,
  loadProcessCapabilities,
  servedPreviewChannels,
  servedClientEngines,
  ctsProjectedDomain,
  nodeTypeId,
  relationOptionsForEntity,
  projectionOptionsForEntity,
  constructionModeOptions,
  processNodeInputs,
  updateProcessNodeConstructionMode,
  selectedNode,
  selectedNodeId,
  selectedGraphNodes,
  selectNode,
  selectEdge,
  clearGraphSelection,
  deleteGraphSelection,
  canvasFrame,
  touchPanDrag,
  handleDesignerPointerDown,
  handleDesignerFocus,
  handleDesignerWheel,
  beginSocketConnection,
  endSocketConnection,
  frameSelectedNodes,
  zoomCanvasIn,
  zoomCanvasOut,
  resetCanvasZoom,
  frameAllNodes,
  designerViewport,
  toggleSecondaryHidden,
  addNode,
  onConnect,
  renameDeclarationNode,
  updateClassName,
  setClassIdentifierField,
  classIdentifierField,
  classTypeIdValid,
  classDeclarationDiagnostics,
  declarationNodeTypes,
  selectedDeclarationEdge,
  paletteChipGroups,
  contextPaletteChipGroups,
  contextPalette,
  openPanePalette,
  closeContextPalette,
  addContextNode,
  contextPaletteSearch,
  selectedEntity,
  selectedProcessNode,
  selectedEntityAvailable,
  servicePrincipalOptions,
  typeIdOptions,
  roleOptions,
  commandOptions,
  selectedCommandService,
  createCommandServiceForSelectedNode,
  removeSelectedCommandService,
  transitionGuardFieldOptions,
  recordStatePolicyTarget,
  recordStateFieldPolicyOptions,
  selectedProcessNodeGrants,
  selectedProcessNodeEffectiveAccess,
  updateSelectedProcessNodeGrantLevel,
  validationDiffLines,
  selectedNodeSupportsPreview,
  previewingData,
  selectedNodePreview,
  selectedNodePreviewOutputs,
  selectedChannelNode,
  selectedChannelOutputs,
  previewDataflow,
  formatPreviewPath,
  formatPreviewItems
} = useProcessDesignerGraphSession({
  t,
  te,
  toast,
  draft,
  roles: () => organizationRoles.value,
  activeOrganizationId,
  persistence: graphPersistence,
  graphEvaluation: channelPreview.payload
});

const selectedConstructionModes = computed(() => (selectedNode.value?.type === 'processNode' ? constructionModeOptions(nodeTypeId(selectedProcessNode.value)) : []));
const inspectorPreview = computed(() => ({
  supported: selectedNodeSupportsPreview.value,
  running: previewingData.value || channelPreview.running.value,
  state: selectedChannelNode.value || selectedNodePreview.value,
  outputs: selectedNode.value?.type === 'processNode'
    ? (selectedChannelOutputs.value.length ? selectedChannelOutputs.value : selectedNodePreviewOutputs.value)
    : []
}));
const isDirty = computed(() => !readOnly.value && Boolean(draft.value) && designerSignature() !== savedSignature.value);

const declarationTypeOptions = computed(() => [
  ...new Set([
    ...ctsTypeView().map(entry => entry.id),
    ...nodes.value.filter(node => node.type === 'ctsClass' && node.data?.typeId).map(node => node.data.typeId)
  ])
]);
const typeAnchorOptions = computed(() => ctsTypeView().map(entry => ({
  label: `${entry.label} · ${entry.class}`,
  value: entry.id
})));

const canvasDockItems = computed(() => [
  {
    icon: 'pi pi-eye-slash',
    label: t('processDesigner.hideSecondary'),
    pressed: secondaryHidden.value,
    onClick: toggleSecondaryHidden
  },
  { separator: true },
  {
    icon: 'pi pi-search-minus',
    label: t('drawing.zoomOut'),
    onClick: zoomCanvasOut
  },
  {
    icon: 'pi pi-search-plus',
    label: t('drawing.zoomIn'),
    onClick: zoomCanvasIn
  },
  {
    icon: 'pi pi-expand',
    label: t('processDesigner.frameAll'),
    onClick: frameAllNodes
  },
  {
    icon: 'pi pi-crosshairs',
    label: t('processDesigner.frameSelection'),
    onClick: frameSelectedNodes
  },
  {
    icon: 'pi pi-refresh',
    label: t('processDesigner.resetZoom'),
    onClick: resetCanvasZoom
  }
]);

function emptyGraphDocument() {
  return {
    data: canvasToDefinition(
      { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
      { dataflowVersion: PROCESS_DATAFLOW_VERSION }
    )
  };
}

function parseGraphPayload(text) {
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(t('processDesigner.invalidGraphPayload'));
  }
  return { data };
}

// The bound instance (the blank page has none until its first save).
let instanceId = String(props.record?._id || props.record?.id || '');

async function loadGraphDocument() {
  loading.value = true;
  loadError.value = '';
  try {
    const text = await props.persistence.load();
    const value = text ? parseGraphPayload(text) : emptyGraphDocument();
    loadDocument(value, {
      onLoaded: () => {
        savedSignature.value = designerSignature();
      }
    });
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
    const updated = await props.persistence.save(JSON.stringify(serializeProcess(), null, 2), `${name}.json`);
    instanceId = String(updated?._id || updated?.id || instanceId);
    // The blank page's first save creates the instance unnamed; a name
    // authored before it applies right after the create.
    if (!props.record?._id && recordName.value && recordName.value !== updated?.name) {
      const renamed = await props.persistence.rename(recordName.value);
      recordName.value = renamed?.name || recordName.value;
    } else if (updated?.name) {
      recordName.value = updated.name;
    }
    savedSignature.value = designerSignature();
    toast.add({ severity: 'success', summary: t('processDesigner.saved'), life: 2400 });
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.save'), detail: error?.data?.message || error?.message || '', life: 5000 });
  } finally {
    saving.value = false;
  }
}

async function renameGraphDocument(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return;
  // The blank page names at its first save: before the instance exists
  // the name rides the local draft and the save applies it.
  if (!instanceId) {
    recordName.value = trimmed;
    return;
  }
  try {
    const updated = await props.persistence.rename(trimmed);
    recordName.value = updated?.name || trimmed;
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.rename'), detail: error?.data?.message || error?.message || '', life: 4000 });
  }
}

// The document chrome hand-off (SPEC §4): the header renders the name,
// the dirty-marked save from this binding; a read grant binds the name
// alone.
props.pageChrome?.bind?.(Object.assign(
  reactive({
    name: computed(() => recordName.value),
    dirty: isDirty,
    saving,
    diverged: false
  }),
  readOnly.value ? {} : { save: saveGraphDocument, rename: renameGraphDocument }
));

// The channel tab follows the authoring signature — one debounced seam
// runs while the tab stays open (composables README).
const authoringSignature = computed(() => JSON.stringify({
  data: draftDataSignature.value,
  nodes: nodes.value.map(node => [node.id, node.type, node.data]),
  edges: edges.value.map(edge => [edge.id, edge.source, edge.target, edge.sourceHandle, edge.targetHandle, edge.role, edge.label])
}));
// C2 live values: the channel evaluation runs while the inspector or the
// preview tab is open — the selected node's outputs render live in both.
watch(authoringSignature, () => channelPreview.schedule(['inspector', 'preview'].includes(inspectTab.value)));
watch(inspectTab, () => channelPreview.schedule(['inspector', 'preview'].includes(inspectTab.value)));

onMounted(async () => {
  loadProcessCapabilities();
  loadOrgTypes();
  const organizationId = authStore.organizationData?._id || authStore.userData?.organizationId || authStore.memberships?.[0]?.organizationId;
  organizationRoles.value = organizationId ? await rolePersistence.list(organizationId).catch(() => ({})) : {};
  await loadGraphDocument();
});
</script>
