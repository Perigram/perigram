<template>
  <DesignerSurface>
    <DesignerWorkspace layout="lanes" class="h-full" :document-items="documentDockItems" :canvas-items="canvasDockItems">
      <div class="relative h-full w-full overflow-hidden">
      <svg
        ref="svgRef"
        class="h-full w-full touch-none"
        :viewBox="editorViewBox"
        role="application"
        :aria-label="$t('sheetDesign.editor')"
        @pointermove="dragPlacement"
        @pointerup="finishDrag"
        @pointercancel="finishDrag"
        @keydown.esc.stop.prevent="selectedIndex = -1"
      >
        <defs>
          <pattern :id="gridPatternId" :width="majorGridSize" :height="majorGridSize" patternUnits="userSpaceOnUse">
            <path :d="`M ${majorGridSize} 0 L 0 0 0 ${majorGridSize}`" fill="none" stroke="var(--p-text-muted-color)" stroke-opacity="0.28" :stroke-width="Math.max(majorGridSize / 80, 0.4)" />
          </pattern>
        </defs>
        <polygon v-if="sheetPolygonPoints" :points="sheetPolygonPoints" fill="var(--p-content-background)" />
        <rect v-else x="0" y="0" :width="sheetWidth" :height="sheetHeight" fill="var(--p-content-background)" />
        <polygon v-if="sheetPolygonPoints" :points="sheetPolygonPoints" :fill="`url(#${gridPatternId})`" />
        <rect v-else x="0" y="0" :width="sheetWidth" :height="sheetHeight" :fill="`url(#${gridPatternId})`" />
        <polygon
          v-if="sheetPolygonPoints"
          :points="sheetPolygonPoints"
          fill="none"
          :stroke="sheetBoundaryStyle.color"
          :stroke-width="displayStrokeWidth(sheetBoundaryStyle.weight, 2)"
          :stroke-dasharray="sheetBoundaryStyle.dasharray"
          vector-effect="non-scaling-stroke"
        />
        <rect
          v-else
          x="0"
          y="0"
          :width="sheetWidth"
          :height="sheetHeight"
          fill="none"
          :stroke="sheetBoundaryStyle.color"
          :stroke-width="displayStrokeWidth(sheetBoundaryStyle.weight, 2)"
          :stroke-dasharray="sheetBoundaryStyle.dasharray"
          vector-effect="non-scaling-stroke"
        />

        <g v-if="selectedSnapPoint" pointer-events="none">
          <line :x1="selectedSnapPoint.x" y1="0" :x2="selectedSnapPoint.x" :y2="sheetHeight" stroke="var(--p-primary-color)" stroke-dasharray="4 4" vector-effect="non-scaling-stroke" />
          <line x1="0" :y1="selectedSnapPoint.y" :x2="sheetWidth" :y2="selectedSnapPoint.y" stroke="var(--p-primary-color)" stroke-dasharray="4 4" vector-effect="non-scaling-stroke" />
        </g>
        <g
          v-for="(placement, index) in placedItems"
          :key="placementKey(placement, index)"
          :transform="placementSvgTransform(placement)"
          class="cursor-move"
          tabindex="0"
          @pointerdown.stop="startDrag($event, index)"
          @focus="selectedIndex = index"
          @keydown.delete.stop.prevent="removePlacement(index)"
          @keydown.backspace.stop.prevent="removePlacement(index)"
        >
          <template v-for="(layer, layerIndex) in placementLayers(placement)" :key="`${placementKey(placement, index)}-layer-${layerIndex}`">
            <polyline
              v-if="layerPoints(layer).length >= 2"
              :points="layerPoints(layer).map(point => point.join(',')).join(' ')"
              fill="none"
              :stroke="layerStyle(layer).color"
              :stroke-width="displayStrokeWidth(layerStyle(layer).weight)"
              :stroke-dasharray="layerStyle(layer).dasharray"
              stroke-linecap="round"
              stroke-linejoin="round"
              vector-effect="non-scaling-stroke"
            />
            <!-- Data-driven exception: layer annotation size is part of sheet geometry. -->
            <text
              v-else-if="layerText(layer)"
              :x="layerText(layer).x"
              :y="layerText(layer).y"
              :fill="layerStyle(layer).color"
              :font-size="layerText(layer).fontSize"
              dominant-baseline="hanging"
              pointer-events="none"
            >{{ layerText(layer).text }}</text>
          </template>
          <polygon
            v-if="!placementHasContour(placement)"
            :points="placementPoints(placement)"
            fill="none"
            :stroke="fallbackPlacementStyle.color"
            :stroke-width="displayStrokeWidth(fallbackPlacementStyle.weight)"
            :stroke-dasharray="fallbackPlacementStyle.dasharray"
            vector-effect="non-scaling-stroke"
          />
          <polygon
            v-if="selectedIndex === index"
            :points="placementPoints(placement)"
            fill="var(--p-primary-color)"
            fill-opacity="0.1"
            stroke="var(--p-primary-color)"
            stroke-width="2"
            vector-effect="non-scaling-stroke"
          />
        </g>
      </svg>
      </div>

      <Popover ref="dockMenu">
        <div class="flex min-w-72 flex-col gap-2" @mousedown.stop @click.stop>
          <InputText
            v-if="dockPopoverPanel === 'rename'"
            v-model="renameDraft"
            :placeholder="$t('sheetDesign.sheetDesigns')"
            class="w-full"
            :aria-label="$t('common.rename')"
            @keydown.enter.stop.prevent="applyRename"
          />
          <Select
            v-else-if="dockPopoverPanel === 'open'"
            :model-value="null"
            :options="sheetOptions"
            option-label="label"
            option-value="value"
            type-id="sheet-design"
            :placeholder="$t('sheetDesign.editor')"
            class="w-full"
            @update:model-value="value => openDesignById(value)"
          />
          <Button
            v-if="dockPopoverPanel === 'rename'"
            icon="pi pi-check"
            :label="$t('common.save')"
            size="small"
            :disabled="!renameDraft.trim()"
            @click="applyRename"
          />
        </div>
      </Popover>
    </DesignerWorkspace>

    <StandardDialog v-model:visible="addVisible" :header="$t('sheetDesign.addCassette')" size="md">
      <Select
        v-model="selectedCassetteId"
        :options="cassetteOptions"
        option-label="label"
        option-value="value"
        type-id="cassette"
        class="w-full"
        :placeholder="$t('sheetDesign.selectCassette')"
      />
      <template #footer>
        <Button :label="$t('common.cancel')" severity="secondary" text size="small" @click="addVisible = false" />
        <Button :label="$t('common.add')" icon="pi pi-plus" size="small" :disabled="!selectedCassetteId" @click="addSelectedCassette" />
      </template>
    </StandardDialog>

    <CassetteEditorDialog v-model="uploadVisible" @saved="addUploadedCassette" />
    </DesignerSurface>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Popover from 'primevue/popover';
import Select from '~/components/shared/InstanceSelect.vue';
import DesignerSurface from '~/components/shared/DesignerSurface.vue';
import DesignerWorkspace from '~/components/shared/DesignerWorkspace.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import { hasPermissionGrant } from '#shared/access-control.js';
import { recomputeSheetLayout } from '~/utils/sheetLayout.js';
import { resolveTypeFeature } from '#shared/field-access-policies.js';
import { useSnapshotHistory } from '~/composables/useSnapshotHistory.js';
import CassetteEditorDialog from '~/components/CassetteEditorDialog.vue';
import { useInstancesStore } from '~/stores/instances';
import { useLayerStandardsStore } from '~/stores/layerStandards';
import { usePenTemplatesStore } from '~/stores/penTemplates';
import { DEFAULT_DRAWING_PEN, applyLayerPens } from '~/utils/drawingPreview.js';
import {
  cassetteSheetItem,
  clampSheetPlacement,
  magneticSheetPlacement,
  placementWithTranslation,
  rotateSheetPlacementQuarterTurn,
  sheetItemPoints,
  sheetLayoutState,
  sheetPlacementSource,
  sheetPlacementTransform
} from '~/utils/sheetLayoutEditor.js';

const documentDockItems = computed(() => [
  {
    icon: 'pi pi-folder-open',
    label: t('common.open'),
    hasPopup: true,
    disabled: !editable.value,
    onClick: () => openDockPopover('open')
  },
  {
    icon: 'pi pi-pencil',
    label: t('common.rename'),
    hasPopup: true,
    disabled: !editable.value,
    onClick: () => openDockPopover('rename')
  },
  { separator: true },
  {
    icon: 'pi pi-save',
    label: t('common.save'),
    disabled: !editable.value || saving.value,
    loading: saving.value,
    onClick: () => save()
  }
]);

const canvasDockItems = computed(() => [
  {
    icon: 'pi pi-undo',
    label: t('common.undo'),
    disabled: !canUndo.value,
    onClick: () => layoutHistory.undo()
  },
  {
    icon: 'pi pi-refresh',
    label: t('common.redo'),
    disabled: !canRedo.value,
    onClick: () => layoutHistory.redo()
  },
  { separator: true },
  {
    icon: 'pi pi-search-minus',
    label: t('drawing.zoomOut'),
    onClick: () => zoomOut()
  },
  {
    icon: 'pi pi-search-plus',
    label: t('drawing.zoomIn'),
    onClick: () => zoomIn()
  },
  {
    icon: 'pi pi-times-circle',
    label: t('drawing.resetView'),
    onClick: () => resetZoom()
  },
  { separator: true },
  {
    icon: 'pi pi-plus',
    label: t('sheetDesign.addCassette'),
    disabled: !editable.value,
    onClick: () => openAddDialog()
  },
  {
    icon: 'pi pi-upload',
    label: t('common.upload'),
    disabled: !editable.value,
    onClick: () => { uploadVisible.value = true; }
  },
  {
    icon: 'pi pi-refresh',
    label: t('common.rotate'),
    disabled: !editable.value || selectedIndex.value < 0,
    onClick: () => rotateSelected()
  },
  {
    icon: 'pi pi-trash',
    label: t('common.delete'),
    disabled: !editable.value || selectedIndex.value < 0,
    onClick: () => removeSelected()
  }
]);

const props = defineProps({
  design: { type: Object, required: true }
});
const emit = defineEmits(['saved', 'open-page', 'refresh']);
const { t } = useI18n();
const toast = useToast();
const authStore = useAuthStore();
const standardsStore = useLayerStandardsStore();
const pensStore = usePenTemplatesStore();
const { standards } = storeToRefs(standardsStore);
const { pens, systemPens } = storeToRefs(pensStore);

// The editor resolves its own write grant: as a workspace page it has no
// detail-host adapter to compute one, and degrades to view-only without it.
const editable = computed(() => hasPermissionGrant({
  permissions: authStore.activePermissions,
  feature: resolveTypeFeature('sheet-design'),
  level: 'write',
  entity: props.design,
  typeId: 'sheet-design'
}));

const svgRef = ref(null);
const items = ref([]);
const placedItems = ref([]);
const selectedIndex = ref(-1);
const dragState = ref(null);
const saving = ref(false);
const addVisible = ref(false);
const uploadVisible = ref(false);
const instances = useInstancesStore();
const cassettes = ref([]);
const selectedCassetteId = ref('');

const sheetWidth = computed(() => Math.max(Number(props.design.specs?.width) || 1220, 1));
const sheetHeight = computed(() => Math.max(Number(props.design.specs?.length) || 2440, 1));
const sheetPolygon = computed(() => normalizeSheetPolygon(
  props.design.data?.geometry?.data?.sheetPolygon ||
  props.design.data?.geometry?.data?.sheet_polygon ||
  props.design.data?.geometry?.data?.polygon ||
  props.design.data?.materialPool?.[0]?.sheetPolygon ||
  null
));
const sheetPolygonPoints = computed(() => sheetPolygon.value?.outer?.map(point => point.join(',')).join(' ') || '');
const solveEffective = computed(() => props.design.provenance?.solve?.effective || {});
const toolKerf = computed(() => Math.max(Number(
  solveEffective.value.tool?.kerf ?? 0
) || 0, 0));
const boundaryOffset = computed(() => Math.max(Number(solveEffective.value.machine?.boundaryOffset || 0), 0));
const editorPadding = computed(() => Math.max(sheetWidth.value, sheetHeight.value) * 0.025);
// Zoom narrows the viewBox around the sheet center; placements stay in
// sheet coordinates so zooming never rewrites geometry.
const viewZoom = ref(1);
const zoomIn = () => { viewZoom.value = Math.max(0.2, viewZoom.value / 1.25); };
const zoomOut = () => { viewZoom.value = Math.min(8, viewZoom.value * 1.25); };
const resetZoom = () => { viewZoom.value = 1; };const editorViewBox = computed(() => {
  const width = (sheetWidth.value + editorPadding.value * 2) * viewZoom.value;
  const height = (sheetHeight.value + editorPadding.value * 2) * viewZoom.value;
  return [
    sheetWidth.value / 2 - width / 2,
    sheetHeight.value / 2 - height / 2,
    width,
    height
  ].join(' ');
});
const majorGridSize = computed(() => {
  const target = Math.max(sheetWidth.value, sheetHeight.value) / 28;
  const scale = 10 ** Math.floor(Math.log10(Math.max(target, 1)));
  return Math.ceil(target / scale) * scale;
});
const gridPatternId = computed(() => `sheet-layout-grid-${String(props.design._id || 'sheet').replace(/[^A-Za-z0-9_-]/g, '-')}`);
const layerCodes = computed(() => Array.from(new Set([
  'contour.material_sheet',
  'contour.cassette_face',
  ...items.value.flatMap(item => (item.sourceLayers || []).map(sourceLayerCode))
].filter(Boolean))));
const resolvedLayerStyles = computed(() => {
  const drawing = applyLayerPens({
    layers: layerCodes.value.map(code => ({ name: code, standardCode: code, paths: [] }))
  }, {
    standards: standards.value,
    pens: pens.value,
    defaultPen: systemPens.value[0] || DEFAULT_DRAWING_PEN
  });
  return new Map((drawing.layers || []).map(layer => [layer.standardCode || layer.name, layer]));
});
const sheetBoundaryStyle = computed(() => resolvedStyle('contour.material_sheet'));
const fallbackPlacementStyle = computed(() => resolvedStyle('contour.cassette_face'));
const selectedSnapPoint = computed(() => selectedIndex.value >= 0
  ? sheetPlacementTransform(placedItems.value[selectedIndex.value])
  : null);
const cassetteOptions = computed(() => cassettes.value.map(cassette => ({
  label: cassette.identity?.name || cassette.identity?.slug || cassette._id,
  value: cassette._id?.toString(),
  entity: cassette
})));

onMounted(async () => {
  await Promise.all([
    standardsStore.fetchStandards?.(),
    pensStore.fetchPens?.(),
  ]);
});

// Layout history: snapshots are the serialized placements; a design switch
// re-baselines instead of undoing across documents.
const layoutHistory = useSnapshotHistory({
  snapshot: () => JSON.stringify(placedItems.value),
  apply: (entry) => {
    placedItems.value = JSON.parse(entry);
    selectedIndex.value = -1;
  }
});
const canUndo = layoutHistory.canUndo;
const canRedo = layoutHistory.canRedo;

// Document identity: a local rename override keeps the bar live until the
// refreshed DTO arrives.
const localName = ref('');
const displayName = computed(() => localName.value || props.design.identity?.name || t('sheetDesign.editor'));

function resetLayout() {
  const state = sheetLayoutState(props.design);
  items.value = state.items;
  placedItems.value = state.placedItems;
  selectedIndex.value = -1;
  viewZoom.value = 1;
  localName.value = '';
  layoutHistory.reset();
}

watch(() => props.design._id, resetLayout, { immediate: true });

const dockMenu = ref(null);
const dockPopoverPanel = ref('rename');
const renameDraft = ref('');
const sheetOptions = ref([]);

function openDockPopover(panel) {
  dockPopoverPanel.value = panel;
  if (panel === 'rename') renameDraft.value = displayName.value;
  if (panel === 'open' && !sheetOptions.value.length) {
    instances.listInstances(instances.canonicalTypeKey('sheet-design'), {})
      .then(designs => {
        sheetOptions.value = (Array.isArray(designs) ? designs : [])
          .filter(design => String(design._id) !== String(props.design._id))
          .map(design => ({
            label: design.identity?.name || design.identity?.uid || design._id,
            value: design._id?.toString(),
            entity: design
          }));
      })
      .catch(() => {});
  }
  dockMenu.value?.show?.();
}

function openDesignById(id) {
  const option = sheetOptions.value.find(candidate => candidate.value === String(id));
  dockMenu.value?.hide?.();
  if (!option?.entity) return;
  emit('open-page', { pageId: 'sheet-design-editor', entity: option.entity, typeId: 'sheet-design' });
}

async function applyRename() {
  const name = renameDraft.value.trim();
  if (!name || name === displayName.value) {
    dockMenu.value?.hide?.();
    return;
  }
  try {
    await instances.mutateDirect(instances.canonicalTypeKey('sheet-design'), 'PATCH', {
      id: props.design._id,
      body: { identity: { name } },
      meta: { change: 'updated', reason: 'sheet-design-rename' }
    });
    localName.value = name;
    emit('refresh');
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 4000 });
  }
  dockMenu.value?.hide?.();
}

function placementKey(placement, index) {
  return placement.id || `${placement.item_id ?? placement.itemId ?? 'item'}-${index}`;
}

function placementPoints(placement) {
  return sheetItemPoints(sheetPlacementSource(items.value, placement)).map(point => point.join(',')).join(' ');
}

function sourceLayerCode(layer = {}) {
  return layer.standardCode || layer.code || layer.layer || layer.name || 'contour.cassette_face';
}

function resolvedStyle(code) {
  return resolvedLayerStyles.value.get(code) || {
    color: 'currentColor',
    weight: 1,
    dasharray: 'none'
  };
}

function placementLayers(placement) {
  return (sheetPlacementSource(items.value, placement)?.sourceLayers || [])
    .filter(layer => layerPoints(layer).length >= 2 || layerText(layer));
}

function layerPoints(layer = {}) {
  if (Array.isArray(layer.coordinates)) return layer.coordinates
    .filter(point => Array.isArray(point) && point.length >= 2)
    .map(point => [Number(point[0]) || 0, Number(point[1]) || 0]);
  if (layer.geometry?.type === 'dimension') {
    return [layer.geometry.from, layer.geometry.to]
      .filter(point => Array.isArray(point) && point.length >= 2)
      .map(point => [Number(point[0]) || 0, Number(point[1]) || 0]);
  }
  return [];
}

function placementHasContour(placement) {
  return placementLayers(placement).some(layer => (
    /^(cut|contour)(\.|$)/.test(sourceLayerCode(layer)) && layerPoints(layer).length >= 3
  ));
}

function layerText(layer = {}) {
  if (layer.geometry?.type !== 'text') return null;
  const point = layer.geometry.point || layer.geometry.position || layer.geometry.origin;
  const text = layer.geometry.text || layer.value?.value;
  if (!Array.isArray(point) || !text) return null;
  return { x: Number(point[0]) || 0, y: Number(point[1]) || 0, text, fontSize: Number(layer.geometry.fontSize) || 12 };
}

function layerStyle(layer) {
  return resolvedStyle(sourceLayerCode(layer));
}

function displayStrokeWidth(weight, fallback = 1.5) {
  const numeric = Number(weight);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.max(1, Math.min(numeric * 2, 4));
}

function placementSvgTransform(placement) {
  const transform = sheetPlacementTransform(placement);
  return `translate(${transform.x} ${transform.y}) rotate(${transform.rotation})`;
}

function sheetPoint(event) {
  const matrix = svgRef.value?.getScreenCTM?.();
  if (!matrix) return { x: 0, y: 0 };
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
  return { x: point.x, y: point.y };
}

function startDrag(event, index) {
  if (!editable.value) return;
  const pointer = sheetPoint(event);
  const transform = sheetPlacementTransform(placedItems.value[index]);
  selectedIndex.value = index;
  layoutHistory.commit();
  dragState.value = { index, pointerId: event.pointerId, dx: pointer.x - transform.x, dy: pointer.y - transform.y };
  svgRef.value?.setPointerCapture?.(event.pointerId);
}

function dragPlacement(event) {
  const drag = dragState.value;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const pointer = sheetPoint(event);
  const placement = placedItems.value[drag.index];
  const source = sheetPlacementSource(items.value, placement);
  const bounded = magneticSheetPlacement({
    items: items.value,
    placements: placedItems.value,
    index: drag.index,
    x: pointer.x - drag.dx,
    y: pointer.y - drag.dy,
    sheetWidth: sheetWidth.value,
    sheetHeight: sheetHeight.value,
    sheetPolygon: sheetPolygon.value,
    boundaryOffset: boundaryOffset.value,
    clearance: toolKerf.value
  });
  if (!bounded) return;
  const { x, y } = bounded;
  placedItems.value[drag.index] = placementWithTranslation(placedItems.value[drag.index], x, y);
}

function finishDrag(event) {
  if (dragState.value?.pointerId === event.pointerId) dragState.value = null;
}

function removePlacement(index) {
  if (!editable.value || index < 0) return;
  layoutHistory.commit();
  placedItems.value.splice(index, 1);
  selectedIndex.value = -1;
}

function removeSelected() {
  removePlacement(selectedIndex.value);
}

function rotateSelected() {
  if (!editable.value || selectedIndex.value < 0) return;
  layoutHistory.commit();
  const rotated = rotateSheetPlacementQuarterTurn({
    items: items.value,
    placements: placedItems.value,
    index: selectedIndex.value,
    sheetWidth: sheetWidth.value,
    sheetHeight: sheetHeight.value,
    sheetPolygon: sheetPolygon.value,
    boundaryOffset: boundaryOffset.value,
    clearance: toolKerf.value
  });
  if (rotated) placedItems.value[selectedIndex.value] = rotated;
}

async function openAddDialog() {
  addVisible.value = true;
  if (!cassettes.value.length) {
    cassettes.value = await instances.listInstances('cassette', {}, { silent: true }).catch(() => []);
  }
}

function addCassette(cassetteEntity) {
  if (!cassetteEntity?._id) return;
  const id = `manual-${cassetteEntity._id}-${Date.now()}-${items.value.length}`;
  const item = cassetteSheetItem(cassetteEntity, id);
  if (!item) return;
  layoutHistory.commit();
  items.value.push(item);
  const start = clampSheetPlacement({
    x: boundaryOffset.value,
    y: boundaryOffset.value,
    item,
    sheetWidth: sheetWidth.value,
    sheetHeight: sheetHeight.value,
    sheetPolygon: sheetPolygon.value,
    boundaryOffset: boundaryOffset.value
  });
  placedItems.value.push({
    item_id: id,
    transformation: { rotation: 0, translation: [start.x, start.y] }
  });
  selectedIndex.value = placedItems.value.length - 1;
}

function normalizeSheetRing(points = []) {
  const normalized = (Array.isArray(points) ? points : [])
    .map(point => Array.isArray(point) && point.length >= 2 ? [Number(point[0]), Number(point[1])] : null)
    .filter(point => point && Number.isFinite(point[0]) && Number.isFinite(point[1]));
  if (normalized.length < 3) return null;
  return normalized;
}

function normalizeSheetPolygon(polygon = null) {
  if (!polygon) return null;
  if (Array.isArray(polygon)) {
    const outer = normalizeSheetRing(polygon);
    return outer ? { outer, inner: [] } : null;
  }
  const outer = normalizeSheetRing(polygon.outer || polygon.data?.outer || []);
  if (!outer) return null;
  return {
    outer,
    inner: (polygon.inner || polygon.data?.inner || []).map(normalizeSheetRing).filter(Boolean)
  };
}

function addSelectedCassette() {
  const cassetteEntity = cassettes.value.find(item => String(item._id) === String(selectedCassetteId.value));
  addCassette(cassetteEntity);
  selectedCassetteId.value = '';
  addVisible.value = false;
}

function addUploadedCassette(payload = {}) {
  const cassetteEntity = payload.template || payload.design || payload;
  if (cassetteEntity?._id && !cassettes.value.some(item => String(item._id) === String(cassetteEntity._id))) {
    cassettes.value.unshift(cassetteEntity);
  }
  addCassette(cassetteEntity);
}

async function save() {
  saving.value = true;
  try {
    const instances = useInstancesStore();
    const { data, summary } = recomputeSheetLayout(props.design, {
      items: items.value,
      placedItems: placedItems.value
    });
    const saved = await instances.mutateDirect(instances.canonicalTypeKey('sheet-design'), 'PATCH', {
      id: String(props.design._id),
      body: { data, summary },
      meta: { change: 'updated', reason: 'layout-update' }
    });
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('sheetDesign.layoutSaved'), life: 2500 });
    emit('saved', saved);
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || t('sheetDesign.layoutSaveFailed'), life: 4000 });
  } finally {
    saving.value = false;
  }
}
</script>
