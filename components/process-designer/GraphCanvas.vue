<template>
  <DesignerSurface>
    <DesignerWorkspace
      :ref="bindFrame"
      :canvas-items="canvasItems"
      :chrome="chrome"
      layout="canvas"
      workspace-id="graph-editor"
      class="relative h-full min-h-0 overflow-hidden bg-process-canvas"
      @mousedown.capture="handleDesignerPointerDown"
      @focusin="handleDesignerFocus"
      @wheel.capture="handleDesignerWheel"
    >
      <!-- The canvas pane wrapper is the geometry home: every canvas
           coordinate (context palette position, client→graph conversion)
           resolves against THIS box, and floating chrome inside it
           positions relative to it. -->
      <div :ref="bindCanvasPane" class="absolute inset-0">
        <ClientOnly>
          <VueFlow
            v-model:nodes="nodes"
            v-model:edges="edges"
            class="process-designer-canvas absolute inset-0 h-full w-full"
            :min-zoom="0.1"
            :max-zoom="4"
            :delete-key-code="null"
            :selection-key-code="true"
            multi-selection-key-code="Shift"
            :selection-mode="SelectionMode.Partial"
            :pan-on-drag="touchPanDrag"
            pan-activation-key-code="Space"
            :pan-on-scroll="true"
            :zoom-on-scroll="false"
            :zoom-on-pinch="true"
            :zoom-on-double-click="false"
            :default-edge-options="defaultEdgeOptions"
            :nodes-draggable="!readOnly"
            :nodes-connectable="!readOnly"
            :edges-updatable="false"
            @node-click="event => selectNode(event.node)"
            @edge-click="event => selectEdge(event.edge)"
            @pane-click="clearGraphSelection"
            @pane-context-menu="openPaletteAtPane"
            @connect-start="beginSocketConnection"
            @connect-end="endSocketConnection"
            @connect="onConnect"
            @node-drag-stop="handleNodeDragStop"
            @nodes-change="handleCanvasNodesChange"
          >
            <template #node-ctsType="slotProps"><CtsTypeNode v-bind="slotProps" /></template>
            <template #node-ctsClass="slotProps"><ClassNode v-bind="slotProps" /></template>
            <template #node-ctsField="slotProps"><FieldNode v-bind="slotProps" @rename="value => renameDeclarationNode(slotProps, value)" /></template>
            <template #node-ctsState="slotProps"><StateNode v-bind="slotProps" @rename="value => renameDeclarationNode(slotProps, value)" /></template>
            <template #node-processNode="slotProps"><ProcessNode v-bind="slotProps" /></template>
            <template #node-graphNode="slotProps"><GraphDocumentNode v-bind="slotProps" /></template>
            <template #edge-selfloop="slotProps"><SelfLoopEdge v-bind="slotProps" /></template>
            <template #zoom-pane>
              <slot name="lane" />
            </template>
          </VueFlow>
          <template #fallback><div class="absolute inset-0" /></template>
        </ClientOnly>

        <!-- Selection speed dial: the quiet-card policy keeps nodes free of
             per-node chrome, so selection actions float beside the last
             selected node instead. -->
        <SpeedDial
          v-if="!readOnly && selectionDialStyle"
          :model="selectionDialItems"
          direction="up-right"
          :style="selectionDialStyle"
          class="absolute z-30"
          button-icon="pi pi-ellipsis-v"
          :aria-label="$t('processDesigner.selectionActions')"
          :tooltip-options="{ event: 'hover', position: 'left' }"
        />

        <div
          v-if="!readOnly && contextPalette.open"
          ref="contextPaletteElement"
          class="absolute z-30 flex max-h-80 w-72 flex-col overflow-hidden rounded-ui bg-content shadow-card"
          :style="{ left: `${contextPalette.x}px`, top: `${contextPalette.y}px` }"
          @mousedown.stop
          @click.stop
        >
          <div class="flex shrink-0 items-center justify-end px-2 pt-2">
            <Button icon="pi pi-times" severity="secondary" text rounded size="small" :aria-label="$t('processDesigner.closeOperationPalette')" @click="closeContextPalette" />
          </div>
          <OperationPalette
            :ref="bindContextPaletteSearch"
            :groups="contextPaletteGroups"
            :placeholder="contextPalette.socket ? $t('processDesigner.compatibleOperations') : $t('processDesigner.addOperation')"
            @pick="addContextNode"
            @close="closeContextPalette"
          />
          <Message v-if="!contextPaletteGroups.length" class="m-2 shrink-0" severity="secondary" size="small">
            {{ $t('processDesigner.noCompatibleOperations') }}
          </Message>
        </div>

        <div v-if="!nodes.length" class="absolute inset-x-4 top-20 z-10 flex justify-center">
          <StateBlock :message="emptyMessage" />
        </div>
      </div>

      <template v-if="!readOnly" #palette>
        <PaletteDock
          :groups="paletteGroups"
          :placeholder="palettePlaceholder"
          @pick="item => (item.action ? item.action() : addNode(item))"
        />
      </template>

      <template #inspector>
        <slot name="inspector" />
      </template>
      <template #preview>
        <slot name="preview" />
      </template>
    </DesignerWorkspace>

    <!-- The canvas validation strip speaks when there is something to
         say: errors, warnings, apply diffs. A valid draft renders
         nothing. -->
    <div v-if="validation && (!validation.ok || (validation.warnings || []).length || validationDiffLines.length)" class="pointer-events-none absolute inset-x-0 bottom-16 z-10 flex justify-center px-4">
      <div class="pointer-events-auto flex max-w-xl flex-col gap-2">
        <Message v-if="!validation.ok" severity="error">
          {{ validation.errors.join('; ') }}
        </Message>
        <Message v-for="warning in validation.warnings || []" :key="warning" severity="warn">{{ warning }}</Message>
        <Message v-if="validationDiffLines.length" severity="info">
          <div class="flex flex-col gap-1">
            <span>{{ $t('processDesigner.applyDiffTitle') }}</span>
            <span v-for="line in validationDiffLines" :key="line">{{ line }}</span>
          </div>
        </Message>
      </div>
    </div>
  </DesignerSurface>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { SelectionMode, VueFlow } from '@vue-flow/core';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import Button from 'primevue/button';
import SpeedDial from 'primevue/speeddial';
import Message from 'primevue/message';
import DesignerSurface from '~/components/shared/DesignerSurface.vue';
import DesignerWorkspace from '~/components/shared/DesignerWorkspace.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import OperationPalette from '~/components/process-designer/OperationPalette.vue';
import PaletteDock from '~/components/process-designer/PaletteDock.vue';
import ProcessNode from '~/components/process-designer/ProcessNode.vue';
import GraphDocumentNode from '~/components/process-designer/GraphDocumentNode.vue';
import CtsTypeNode from '~/components/process-designer/CtsTypeNode.vue';
import SelfLoopEdge from '~/components/process-designer/SelfLoopEdge.vue';
import ClassNode from '~/components/type-designer/TypeNode.vue';
import FieldNode from '~/components/type-designer/FieldNode.vue';
import StateNode from '~/components/type-designer/StateNode.vue';

// The one canvas surface every graph document mounts (SPEC §28): the
// Vue Flow graph with node/edge templates, the palette dock, the
// context palette, the selection speed dial, and the empty/validation
// states. State and authoring verbs come from the session composable
// through props; the `lane` slot carries a host's zoom-pane background
// (the process page's lane bands) and `inspector` the host's rail
// content. `readOnly` renders the canvas alone — the palettes, the
// dial, and every authoring gesture stay off.
const nodes = defineModel('nodes', { type: Array, required: true });
const edges = defineModel('edges', { type: Array, required: true });

const props = defineProps({
  // Function refs: the session's canvas-frame and context-palette-search
  // refs receive the mounted instances here (plain ref props would
  // unwrap at the host's template).
  bindFrame: { type: Function, required: true },
  // The canvas pane element: the geometry home every canvas coordinate
  // (context palette position, client→graph conversion) resolves against.
  bindCanvasPane: { type: Function, required: true },
  bindContextPaletteSearch: { type: Function, required: true },
  canvasItems: { type: Array, default: () => [] },
  // The bound editor-page chrome api: the workspace file panel renders it.
  chrome: { type: Object, default: null },
  touchPanDrag: { type: Boolean, default: false },
  defaultEdgeOptions: { type: Object, default: () => ({ type: 'default' }) },
  paletteGroups: { type: Array, default: () => [] },
  palettePlaceholder: { type: String, default: '' },
  contextPalette: { type: Object, default: () => ({}) },
  contextPaletteGroups: { type: Array, default: () => [] },
  emptyMessage: { type: String, default: '' },
  validation: { type: Object, default: null },
  validationDiffLines: { type: Array, default: () => [] },
  selectedGraphNodes: { type: Function, required: true },
  selectedNodeId: { type: String, default: '' },
  viewport: { type: Object, default: null },
  frameSelectedNodes: { type: Function, required: true },
  deleteGraphSelection: { type: Function, required: true },
  addNode: { type: Function, required: true },
  addContextNode: { type: Function, required: true },
  closeContextPalette: { type: Function, required: true },
  renameDeclarationNode: { type: Function, required: true },
  handleDesignerPointerDown: { type: Function, required: true },
  handleDesignerFocus: { type: Function, required: true },
  handleDesignerWheel: { type: Function, required: true },
  selectNode: { type: Function, required: true },
  selectEdge: { type: Function, required: true },
  clearGraphSelection: { type: Function, required: true },
  openPanePalette: { type: Function, required: true },
  beginSocketConnection: { type: Function, required: true },
  endSocketConnection: { type: Function, required: true },
  onConnect: { type: Function, required: true },
  handleNodeDragStop: { type: Function, default: null },
  handleCanvasNodesChange: { type: Function, default: null },
  readOnly: { type: Boolean, default: false }
});

const { t } = useI18n();

function openPaletteAtPane(event) {
  if (!props.readOnly) props.openPanePalette(event);
}

// The context palette follows the popover contract: any pointerdown
// outside it dismisses it.
const contextPaletteElement = ref(null);
function dismissContextPaletteOnOutside(event) {
  if (contextPaletteElement.value?.contains(event.target)) return;
  if (props.contextPalette?.open) props.closeContextPalette();
}
watch(() => props.contextPalette?.open, open => {
  if (open) document.addEventListener('pointerdown', dismissContextPaletteOnOutside, true);
  else document.removeEventListener('pointerdown', dismissContextPaletteOnOutside, true);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', dismissContextPaletteOnOutside, true);
});

// Selection speed dial: delete and frame float beside the last selected
// node while a node selection exists; edge selections keep keyboard
// delete (an edge has no anchor box to sit beside).
const selectionDialItems = computed(() => [
  {
    icon: 'pi pi-crosshairs',
    label: t('processDesigner.frameSelection'),
    command: () => props.frameSelectedNodes()
  },
  {
    icon: 'pi pi-trash',
    label: t('common.delete'),
    command: () => props.deleteGraphSelection()
  }
]);
const selectionDialStyle = computed(() => {
  const selected = props.selectedGraphNodes();
  const node = (selected.length ? selected[selected.length - 1] : null)
    || (props.selectedNodeId ? nodes.value.find(candidate => candidate.id === props.selectedNodeId) : null);
  if (!node?.position) return null;
  const viewport = props.viewport || { x: 0, y: 0, zoom: 1 };
  const zoom = Number(viewport.zoom) || 1;
  const anchorX = Number(node.position.x || 0) * zoom + Number(viewport.x || 0)
    + Number(node.dimensions?.width || 180) * zoom;
  const anchorY = Number(node.position.y || 0) * zoom + Number(viewport.y || 0)
    + Number(node.dimensions?.height || 60) * zoom;
  return { left: `${Math.round(anchorX + 8)}px`, top: `${Math.round(anchorY - 8)}px` };
});
</script>
