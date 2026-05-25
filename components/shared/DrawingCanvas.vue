<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import ProgressSpinner from 'primevue/progressspinner';
import { generateSvgData } from '~/utils/dxfParser';
import { renderCassetteToSVG } from '~/utils/cassetteRenderer';
import {
  DEFAULT_DRAWING_PEN,
  applyLayerPens,
  normalizeCassetteDrawing,
  normalizeGeometryDrawing
} from '~/utils/drawingPreview';
import { useLayerStandardsStore } from '~/stores/layerStandards';
import { usePenTemplatesStore } from '~/stores/penTemplates';

const props = defineProps({
  source: { type: [Object, String], default: null },
  sourceType: { type: String, default: 'geometry-preview' },
  mode: { type: String, default: 'card' },
  layerMapping: { type: Object, default: () => ({}) },
  showLayerPanel: { type: Boolean, default: false },
  defaultPen: { type: Object, default: () => DEFAULT_DRAWING_PEN },
  highlightedExtrusionIndex: { type: Number, default: null }
});

const emit = defineEmits(['ready', 'error', 'layer-toggle', 'designer-action']);

const standardsStore = useLayerStandardsStore();
const pensStore = usePenTemplatesStore();
const { standards } = storeToRefs(standardsStore);
const { pens, systemPens } = storeToRefs(pensStore);

const loading = ref(false);
const error = ref(null);
const drawing = ref(null);
const visibleLayers = ref([]);
const svgElement = ref(null);
const viewBox = ref({ x: 0, y: 0, width: 100, height: 100 });
const isPanning = ref(false);
const panStart = ref({ x: 0, y: 0 });
const hoveredEdge = ref(null);

const isDesigner = computed(() => props.mode === 'designer');
const isViewer = computed(() => props.mode === 'viewer' || isDesigner.value);
const showGrid = computed(() => isViewer.value);
const hasLayers = computed(() => Array.isArray(drawing.value?.layers) && drawing.value.layers.length > 0);
const visibleDrawingLayers = computed(() => {
  if (!hasLayers.value) return [];
  return drawing.value.layers.filter(layer => visibleLayers.value.includes(layer.name));
});
const viewBoxValue = computed(() => `${viewBox.value.x} ${viewBox.value.y} ${viewBox.value.width} ${viewBox.value.height}`);
const displayStrokeWidth = (weight, fallback = 1.5) => {
  const numericWeight = Number(weight);
  if (!Number.isFinite(numericWeight) || numericWeight <= 0) return fallback;
  return Math.max(1, Math.min(numericWeight * 2, 4));
};

const parseViewBox = (value) => {
  const parts = String(value || '0 0 100 100').split(/\s+/).map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isFinite(part))) {
    return { x: 0, y: 0, width: 100, height: 100 };
  }
  return { x: parts[0], y: parts[1], width: Math.max(parts[2], 1), height: Math.max(parts[3], 1) };
};

const loadStores = async () => {
  await Promise.all([
    standardsStore.fetchStandards?.(),
    pensStore.fetchPens?.()
  ]);
};

const defaultPen = computed(() => props.defaultPen || systemPens.value?.[0] || DEFAULT_DRAWING_PEN);

const fetchText = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch drawing (${response.status})`);
  return response.text();
};

const resolveDrawing = async () => {
  if (!props.source) return null;
  const usesLayerContract = ['dxf-text', 'dxf-url'].includes(props.sourceType) || Object.keys(props.layerMapping).length > 0;
  if (usesLayerContract) await loadStores();

  const penOptions = {
    layerMapping: props.layerMapping,
    standards: standards.value,
    pens: pens.value,
    defaultPen: defaultPen.value
  };

  if (props.sourceType === 'geometry-preview') {
    return normalizeGeometryDrawing(props.source, penOptions);
  }

  if (props.sourceType === 'dxf-text' || props.sourceType === 'dxf-url') {
    const dxfText = props.sourceType === 'dxf-url' ? await fetchText(props.source) : props.source;
    const parsed = await generateSvgData(dxfText, {}, defaultPen.value);
    return applyLayerPens(parsed, penOptions);
  }

  if (props.sourceType === 'svg-url') {
    return { viewBox: '0 0 100 100', layers: [], imageUrl: props.source };
  }

  if (props.sourceType === 'parametric-cassette') {
    const result = await renderCassetteToSVG(props.source);
    return normalizeCassetteDrawing(result, props.source?.params || {});
  }

  return null;
};

let resolveToken = 0;
const refresh = async () => {
  const token = ++resolveToken;
  loading.value = true;
  error.value = null;

  try {
    const nextDrawing = await resolveDrawing();
    if (token !== resolveToken) return;
    drawing.value = nextDrawing;
    visibleLayers.value = nextDrawing?.layers?.map(layer => layer.name) || [];
    viewBox.value = parseViewBox(nextDrawing?.viewBox);
    emit('ready', nextDrawing);
  } catch (err) {
    if (token !== resolveToken) return;
    drawing.value = null;
    error.value = err;
    emit('error', err);
  } finally {
    if (token === resolveToken) loading.value = false;
  }
};

watch(
  () => [props.source, props.sourceType, props.layerMapping, props.defaultPen],
  refresh,
  { immediate: true, deep: true }
);

watch(visibleLayers, (layers) => {
  emit('layer-toggle', layers);
});

const isRawSvg = (path) => typeof path === 'string' && path.trim().startsWith('<');

const getPointFromEvent = (event) => {
  if (!svgElement.value) return null;
  const point = svgElement.value.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(svgElement.value.getScreenCTM().inverse());
};

const zoomAt = (point, zoomFactor) => {
  const focus = point || {
    x: viewBox.value.x + viewBox.value.width / 2,
    y: viewBox.value.y + viewBox.value.height / 2
  };
  const newWidth = viewBox.value.width * zoomFactor;
  const newHeight = viewBox.value.height * zoomFactor;
  const dx = (focus.x - viewBox.value.x) * (zoomFactor - 1);
  const dy = (focus.y - viewBox.value.y) * (zoomFactor - 1);
  viewBox.value = {
    x: viewBox.value.x - dx,
    y: viewBox.value.y - dy,
    width: newWidth,
    height: newHeight
  };
};

const handleWheel = (event) => {
  if (!isViewer.value) return;
  event.preventDefault();
  zoomAt(getPointFromEvent(event), event.deltaY > 0 ? 1.1 : 0.9);
};

const zoomIn = () => zoomAt(null, 0.8);
const zoomOut = () => zoomAt(null, 1.25);
const resetView = () => {
  viewBox.value = parseViewBox(drawing.value?.viewBox);
};

const handleMouseDown = (event) => {
  if (!isViewer.value || event.button !== 0 || (isDesigner.value && !event.shiftKey)) return;
  isPanning.value = true;
  panStart.value = { x: event.clientX, y: event.clientY };
  event.preventDefault();
};

const handleMouseMove = (event) => {
  if (!isPanning.value || !svgElement.value) return;
  const dx = (event.clientX - panStart.value.x) * (viewBox.value.width / svgElement.value.clientWidth);
  const dy = (event.clientY - panStart.value.y) * (viewBox.value.height / svgElement.value.clientHeight);
  viewBox.value = { ...viewBox.value, x: viewBox.value.x - dx, y: viewBox.value.y - dy };
  panStart.value = { x: event.clientX, y: event.clientY };
};

const handleMouseUp = () => {
  isPanning.value = false;
};

const clampMenuPoint = (x, y) => {
  if (!process.client) return { x, y };
  const padding = 100;
  return {
    x: Math.min(Math.max(x, padding), window.innerWidth - padding),
    y: Math.min(Math.max(y, padding), window.innerHeight - padding)
  };
};

const requestDesignerAction = async (edgeIndex, edge) => {
  await nextTick();
  if (!svgElement.value) return;
  const point = svgElement.value.createSVGPoint();
  point.x = edge.midX;
  point.y = edge.midY;
  const screenPoint = point.matrixTransform(svgElement.value.getScreenCTM());
  const clamped = clampMenuPoint(screenPoint.x, screenPoint.y);
  emit('designer-action', {
    type: 'add-geometry',
    edgeIndex,
    edge,
    screenX: clamped.x,
    screenY: clamped.y
  });
};

onBeforeUnmount(() => {
  resolveToken += 1;
});
</script>

<template>
  <div
    class="relative flex h-full w-full overflow-hidden rounded-ui border border-content-border bg-subtle"
    :class="mode === 'thumbnail' || mode === 'card' ? 'aspect-[5/3]' : ''"
  >
    <div v-if="loading" class="flex h-full w-full items-center justify-center">
      <ProgressSpinner class="h-8 w-8" />
    </div>

    <div v-else-if="error || !drawing" class="flex h-full w-full items-center justify-center text-muted-color">
      <i :class="error ? 'pi pi-exclamation-circle' : 'pi pi-image'" />
    </div>

    <template v-else>
      <div v-if="showLayerPanel && hasLayers" class="w-64 shrink-0 overflow-y-auto border-r border-content-border p-4">
        <div class="flex flex-col gap-2">
          <div v-for="layer in drawing.layers" :key="layer.name" class="flex items-center gap-2">
            <Checkbox v-model="visibleLayers" :value="layer.name" :inputId="`drawing-layer-${layer.name}`" size="small" />
            <label :for="`drawing-layer-${layer.name}`" class="min-w-0 flex-1 truncate">{{ layer.name }}</label>
            <span class="h-3 w-3 rounded-full" :style="{ backgroundColor: layer.color }" />
          </div>
        </div>
      </div>

      <div class="relative min-w-0 flex-1 overflow-hidden">
        <svg
          ref="svgElement"
          xmlns="http://www.w3.org/2000/svg"
          :viewBox="viewBoxValue"
          class="h-full w-full"
          :class="isPanning ? 'cursor-grabbing' : isDesigner ? 'cursor-crosshair' : isViewer ? 'cursor-move' : ''"
          @mousedown="handleMouseDown"
          @mousemove="handleMouseMove"
          @mouseup="handleMouseUp"
          @mouseleave="handleMouseUp"
          @wheel="handleWheel"
        >
          <defs v-if="showGrid">
            <pattern id="drawing-canvas-grid" width="100" height="100" patternUnits="userSpaceOnUse">
              <path d="M 100 0 L 0 0 0 100" fill="none" stroke="currentColor" class="opacity-10" />
            </pattern>
          </defs>
          <rect v-if="showGrid" :x="viewBox.x" :y="viewBox.y" :width="viewBox.width" :height="viewBox.height" fill="url(#drawing-canvas-grid)" />

          <g
            v-for="layer in visibleDrawingLayers"
            :key="layer.name"
            :stroke="layer.color"
            :stroke-width="displayStrokeWidth(layer.weight)"
            :stroke-dasharray="layer.dasharray"
            fill="none"
            stroke-linecap="round"
            stroke-linejoin="round"
            vector-effect="non-scaling-stroke"
          >
            <template v-for="(path, pathIndex) in layer.paths" :key="`${layer.name}-${pathIndex}`">
              <g v-if="isRawSvg(path)" v-html="path" />
              <path v-else :d="path" vector-effect="non-scaling-stroke" />
            </template>
          </g>

          <image v-if="drawing.imageUrl" :href="drawing.imageUrl" x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMid meet" />

          <template v-if="drawing.allCurves">
            <path
              v-for="(curve, index) in drawing.allCurves.filter(curve => curve.isExtrusion)"
              :key="`extrusion-${index}`"
              :d="curve.path"
              fill="currentColor"
              :class="highlightedExtrusionIndex === index ? 'opacity-20' : 'opacity-5'"
              style="pointer-events: none"
            />
            <path
              v-if="drawing.path"
              :d="drawing.path"
              fill="none"
              stroke="currentColor"
              :stroke-width="displayStrokeWidth(1)"
              stroke-linecap="round"
              stroke-linejoin="round"
              vector-effect="non-scaling-stroke"
            />
          </template>

          <g v-if="isDesigner">
            <g v-for="(edge, index) in drawing.designerEdges || []" :key="`edge-${index}`">
              <line
                :x1="edge.x1"
                :y1="edge.y1"
                :x2="edge.x2"
                :y2="edge.y2"
                stroke="transparent"
                stroke-width="20"
                stroke-linecap="round"
                class="cursor-pointer"
                @mouseenter="hoveredEdge = index"
                @mouseleave="hoveredEdge = null"
                @click.stop="requestDesignerAction(index, edge)"
              />
              <g :transform="`translate(${edge.midX}, ${edge.midY})`" class="pointer-events-none select-none">
                <rect :x="-34" :y="-10" :width="68" :height="20" rx="10" fill="currentColor" :class="hoveredEdge === index ? 'opacity-90' : 'opacity-70'" />
                <text text-anchor="middle" dominant-baseline="middle" class="fill-muted-color text-xs">
                  {{ edge.label }}
                </text>
              </g>
            </g>
          </g>
        </svg>

        <div v-if="isViewer" class="absolute bottom-4 right-4 flex gap-2">
          <Button icon="pi pi-search-minus" rounded severity="secondary" @click="zoomOut" />
          <Button icon="pi pi-refresh" rounded severity="secondary" @click="resetView" />
          <Button icon="pi pi-search-plus" rounded severity="secondary" @click="zoomIn" />
        </div>
      </div>
    </template>
  </div>
</template>
