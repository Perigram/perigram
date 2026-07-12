<template>
  <div class="flex min-h-0 flex-col gap-3">
    <ActionToolbar>
      <template #actions>
        <Tag :value="$t('sheetDesign.snapSize', { size: snapSize })" severity="secondary" size="small" />
        <Button icon="pi pi-plus" size="small" :disabled="!editable" :aria-label="$t('sheetDesign.addCassette')" v-tooltip.top="$t('sheetDesign.addCassette')" @click="openAddDialog" />
        <Button icon="pi pi-upload" severity="secondary" text rounded size="small" :disabled="!editable" :aria-label="$t('common.upload')" v-tooltip.top="$t('common.upload')" @click="uploadVisible = true" />
        <Button icon="pi pi-trash" severity="danger" text rounded size="small" :disabled="!editable || selectedIndex < 0" :aria-label="$t('common.delete')" v-tooltip.top="$t('common.delete')" @click="removeSelected" />
        <Button icon="pi pi-save" size="small" :loading="saving" :disabled="!editable || saving" :aria-label="$t('common.save')" v-tooltip.top="$t('common.save')" @click="save" />
      </template>
    </ActionToolbar>

    <div class="aspect-[3/2] min-h-72 overflow-hidden rounded-ui border border-content-border bg-subtle">
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
        <rect x="0" y="0" :width="sheetWidth" :height="sheetHeight" fill="var(--p-content-background)" />
        <rect x="0" y="0" :width="sheetWidth" :height="sheetHeight" :fill="`url(#${gridPatternId})`" />
        <rect
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

    <StandardDialog v-model:visible="addVisible" :header="$t('sheetDesign.addCassette')" size="md">
      <Select
        v-model="selectedCassetteDesignId"
        :options="cassetteOptions"
        option-label="label"
        option-value="value"
        class="w-full"
        :placeholder="$t('sheetDesign.selectCassette')"
      />
      <template #footer>
        <Button :label="$t('common.cancel')" severity="secondary" text size="small" @click="addVisible = false" />
        <Button :label="$t('common.add')" icon="pi pi-plus" size="small" :disabled="!selectedCassetteDesignId" @click="addSelectedCassette" />
      </template>
    </StandardDialog>

    <CassetteEditorDialog v-model="uploadVisible" @saved="addUploadedCassette" />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import CassetteEditorDialog from '~/components/CassetteEditorDialog.vue';
import { useLayerStandardsStore } from '~/stores/layerStandards';
import { usePenTemplatesStore } from '~/stores/penTemplates';
import { useToolProfilesStore } from '~/stores/toolProfiles';
import { DEFAULT_DRAWING_PEN, applyLayerPens } from '~/utils/drawingPreview.js';
import {
  cassetteDesignSheetItem,
  clampSheetPlacement,
  placementWithTranslation,
  sheetItemPoints,
  sheetLayoutState,
  sheetPlacementSource,
  sheetPlacementTransform
} from '~/utils/sheetLayoutEditor.js';

const props = defineProps({
  design: { type: Object, required: true },
  editable: { type: Boolean, default: false }
});
const emit = defineEmits(['saved']);
const { t } = useI18n();
const toast = useToast();
const standardsStore = useLayerStandardsStore();
const pensStore = usePenTemplatesStore();
const toolsStore = useToolProfilesStore();
const { standards } = storeToRefs(standardsStore);
const { pens, systemPens } = storeToRefs(pensStore);
const { tools } = storeToRefs(toolsStore);

const svgRef = ref(null);
const items = ref([]);
const placedItems = ref([]);
const selectedIndex = ref(-1);
const dragState = ref(null);
const saving = ref(false);
const addVisible = ref(false);
const uploadVisible = ref(false);
const cassetteDesigns = ref([]);
const selectedCassetteDesignId = ref('');

const sheetWidth = computed(() => Math.max(Number(props.design.specs?.width) || 1220, 1));
const sheetHeight = computed(() => Math.max(Number(props.design.specs?.length) || 2440, 1));
const selectedToolProfileId = computed(() => props.design.data?.nestingParams?.toolProfileId || '');
const selectedTool = computed(() => tools.value.find(tool => String(tool._id) === String(selectedToolProfileId.value)) || null);
const snapSize = computed(() => Math.max(Number(
  selectedTool.value?.data?.diameter ||
  selectedTool.value?.data?.kerf ||
  props.design.data?.nestingParams?.spacing ||
  props.design.data?.nestingParams?.space ||
  props.design.data?.geometry?.data?.params?.space ||
  5
) || 5, 0.1));
const editorPadding = computed(() => Math.max(sheetWidth.value, sheetHeight.value) * 0.025);
const editorViewBox = computed(() => [
  -editorPadding.value,
  -editorPadding.value,
  sheetWidth.value + editorPadding.value * 2,
  sheetHeight.value + editorPadding.value * 2
].join(' '));
const majorGridSize = computed(() => {
  const target = Math.max(sheetWidth.value, sheetHeight.value) / 28;
  return snapSize.value * Math.max(1, Math.ceil(target / snapSize.value));
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
const cassetteOptions = computed(() => cassetteDesigns.value.map(design => ({
  label: design.identity?.name || design.identity?.slug || design._id,
  value: design._id?.toString()
})));

onMounted(async () => {
  await Promise.all([
    standardsStore.fetchStandards?.(),
    pensStore.fetchPens?.(),
    toolsStore.fetchTools?.()
  ]);
});

function resetLayout() {
  const state = sheetLayoutState(props.design);
  items.value = state.items;
  placedItems.value = state.placedItems;
  selectedIndex.value = -1;
}

watch(() => props.design._id, resetLayout, { immediate: true });

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
  if (!props.editable) return;
  const pointer = sheetPoint(event);
  const transform = sheetPlacementTransform(placedItems.value[index]);
  selectedIndex.value = index;
  dragState.value = { index, pointerId: event.pointerId, dx: pointer.x - transform.x, dy: pointer.y - transform.y };
  svgRef.value?.setPointerCapture?.(event.pointerId);
}

function dragPlacement(event) {
  const drag = dragState.value;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const pointer = sheetPoint(event);
  const placement = placedItems.value[drag.index];
  const source = sheetPlacementSource(items.value, placement);
  const bounded = clampSheetPlacement({
    x: pointer.x - drag.dx,
    y: pointer.y - drag.dy,
    item: source,
    rotation: placement.transformation?.rotation ?? placement.rotation ?? 0,
    sheetWidth: sheetWidth.value,
    sheetHeight: sheetHeight.value,
    snap: snapSize.value
  });
  const { x, y } = bounded;
  placedItems.value[drag.index] = placementWithTranslation(placedItems.value[drag.index], x, y);
}

function finishDrag(event) {
  if (dragState.value?.pointerId === event.pointerId) dragState.value = null;
}

function removePlacement(index) {
  if (!props.editable || index < 0) return;
  placedItems.value.splice(index, 1);
  selectedIndex.value = -1;
}

function removeSelected() {
  removePlacement(selectedIndex.value);
}

async function openAddDialog() {
  addVisible.value = true;
  if (!cassetteDesigns.value.length) {
    cassetteDesigns.value = await $fetch('/api/cassette-designs').catch(() => []);
  }
}

function addCassetteDesign(design) {
  if (!design?._id) return;
  const id = `manual-${design._id}-${Date.now()}-${items.value.length}`;
  const item = cassetteDesignSheetItem(design, id);
  if (!item) return;
  items.value.push(item);
  const start = clampSheetPlacement({
    x: snapSize.value,
    y: snapSize.value,
    item,
    sheetWidth: sheetWidth.value,
    sheetHeight: sheetHeight.value,
    snap: snapSize.value
  });
  placedItems.value.push({
    item_id: id,
    transformation: { rotation: 0, translation: [start.x, start.y] }
  });
  selectedIndex.value = placedItems.value.length - 1;
}

function addSelectedCassette() {
  const design = cassetteDesigns.value.find(item => String(item._id) === String(selectedCassetteDesignId.value));
  addCassetteDesign(design);
  selectedCassetteDesignId.value = '';
  addVisible.value = false;
}

function addUploadedCassette(payload = {}) {
  const design = payload.design || payload;
  if (design?._id && !cassetteDesigns.value.some(item => String(item._id) === String(design._id))) {
    cassetteDesigns.value.unshift(design);
  }
  addCassetteDesign(design);
}

async function save() {
  saving.value = true;
  try {
    const saved = await $fetch(`/api/sheet-designs/${encodeURIComponent(props.design._id)}`, {
      method: 'PUT',
      body: { items: items.value, placedItems: placedItems.value }
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
