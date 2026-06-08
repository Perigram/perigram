<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import ProgressSpinner from 'primevue/progressspinner';
import ScrollPanel from 'primevue/scrollpanel';
import Tag from 'primevue/tag';
import { generateSvgData } from '~/utils/dxfParser';
import { renderCassetteToSVG } from '~/utils/cassetteRenderer';
import { renderCassetteV2TreeToDrawing } from '~/utils/cassetteV2Renderer';
import {
  DEFAULT_DRAWING_PEN,
  applyLayerPens,
  normalizeCassetteDrawing,
  normalizeGeometryDrawing
} from '~/utils/drawingPreview';
import { useLayerStandardsStore } from '~/stores/layerStandards';
import { usePenTemplatesStore } from '~/stores/penTemplates';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import LayerStandardCard from '~/components/entities/LayerStandard/LayerStandardCard.vue';
import PenTemplateCard from '~/components/entities/PenTemplate/PenTemplateCard.vue';

const props = defineProps({
  source: { type: [Object, String], default: null },
  sourceType: { type: String, default: 'geometry-preview' },
  mode: { type: String, default: 'card' },
  layerMapping: { type: Object, default: () => ({}) },
  showLayerPanel: { type: Boolean, default: false },
  selectedDesignerFaceId: { type: String, default: null },
  visibleLayerNames: { type: Array, default: null },
  defaultPen: { type: Object, default: () => DEFAULT_DRAWING_PEN },
  highlightedExtrusionIndex: { type: Number, default: null }
});

const emit = defineEmits(['ready', 'error', 'layer-toggle', 'designer-action', 'designer-face-select', 'designer-fold-select']);

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
const hoveredFoldEdge = ref(null);
const hoveredFaceId = ref(null);

const isDesigner = computed(() => props.mode === 'designer');
const isViewer = computed(() => props.mode === 'viewer' || isDesigner.value);
const showGrid = computed(() => isViewer.value);
const hasLayers = computed(() => Array.isArray(drawing.value?.layers) && drawing.value.layers.length > 0);
const layerNames = computed(() => drawing.value?.layers?.map(layer => layer.name) || []);
const isLayerVisibilityControlled = computed(() => Array.isArray(props.visibleLayerNames));
const visibleLayerSelection = computed({
  get: () => isLayerVisibilityControlled.value ? props.visibleLayerNames : visibleLayers.value,
  set: (layers) => {
    const nextLayers = Array.isArray(layers) ? layers : [];
    if (isLayerVisibilityControlled.value) {
      emit('layer-toggle', nextLayers);
      return;
    }
    visibleLayers.value = nextLayers;
  }
});
const allLayersVisible = computed(() => hasLayers.value && layerNames.value.every(name => visibleLayerSelection.value.includes(name)));
const visibleLayerSummary = computed(() => `${visibleLayerSelection.value.length}/${layerNames.value.length}`);
const sameEntityId = (left, right) => left?.toString?.() === right?.toString?.();
const standardCode = (standard) => standard?.data?.code || standard?.code || null;
const sourceLayerEntity = (layer) => ({
  _id: `drawing-layer-${layer.name}`,
  identity: {
    uid: layer.name,
    name: layer.name,
    slug: layer.standardCode || ''
  },
  data: {}
});
const layerPanelRows = computed(() => (drawing.value?.layers || []).map(layer => {
  const standard = standards.value.find(item => (
    sameEntityId(item._id, layer.standardId) ||
    (layer.standardCode && standardCode(item) === layer.standardCode)
  )) || null;
  const pen = pens.value.find(item => sameEntityId(item._id, layer.penId)) || null;

  return {
    key: layer.name,
    layer,
    sourceEntity: sourceLayerEntity(layer),
    standard,
    pen
  };
}));
const visibleDrawingLayers = computed(() => {
  if (!hasLayers.value) return [];
  return drawing.value.layers.filter(layer => visibleLayerSelection.value.includes(layer.name));
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

const sourceLayers = (source) => {
  const geometry = source?.data?.geometry || source?.geometry || source || {};
  const preview = geometry.preview || geometry.data || geometry;
  return Array.isArray(preview.layers) ? preview.layers : [];
};

const sourceHasStandardCodes = (source) => (
  sourceLayers(source).some(layer => (
    layer.standardCode ||
    layer.code ||
    (typeof layer.name === 'string' && layer.name.includes('.'))
  ))
);

const resolveDrawing = async () => {
  if (!props.source) return null;
  const usesLayerContract = (
    ['dxf-text', 'dxf-url', 'parametric-cassette'].includes(props.sourceType) ||
    props.sourceType === 'occs-cassette' ||
    Object.keys(props.layerMapping).length > 0 ||
    (props.sourceType === 'geometry-preview' && sourceHasStandardCodes(props.source))
  );
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
    return {
      viewBox: '0 0 100 100',
      layers: [{
        name: 'image',
        paths: [{
          kind: 'image',
          href: props.source,
          x: 0,
          y: 0,
          width: 100,
          height: 100
        }]
      }]
    };
  }

  if (props.sourceType === 'parametric-cassette') {
    const result = await renderCassetteToSVG(props.source);
    return applyLayerPens(normalizeCassetteDrawing(result, {
      params: props.source?.params || {},
      layers: props.source?.layers || props.source?.layerRoles || {}
    }), penOptions);
  }

  if (props.sourceType === 'occs-cassette') {
    const graphTree = props.source?.extensions?.cutkit?.graphTree || props.source?.graphTree || null;
    if (!graphTree) return null;
    return applyLayerPens(await renderCassetteV2TreeToDrawing(graphTree), penOptions);
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
    if (!isLayerVisibilityControlled.value) {
      visibleLayers.value = nextDrawing?.layers?.map(layer => layer.name) || [];
    }
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
const pathKind = (path) => typeof path === 'object' && path?.kind ? path.kind : 'path';
const pathD = (path) => typeof path === 'string' ? path : path?.d;
const pathFill = (path, layer) => {
  if (typeof path === 'string') return 'none';
  if (path?.fill === 'layer') return layer.color;
  return path?.fill || 'none';
};
const pathStroke = (path, layer) => {
  if (typeof path === 'string') return null;
  if (path?.stroke === 'none') return 'none';
  if (path?.stroke === 'layer') return layer.color;
  return path?.stroke || null;
};
const pathOpacity = (path) => {
  if (typeof path === 'string') return null;
  if (path.extrusionIndex === props.highlightedExtrusionIndex) return path.highlightedOpacity || path.opacity || null;
  return path.opacity || null;
};

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
const showAllLayers = () => {
  visibleLayerSelection.value = [...layerNames.value];
};
const hideAllLayers = () => {
  visibleLayerSelection.value = [];
};
const layerInputId = (layer) => `drawing-layer-${String(layer.name).replace(/[^A-Za-z0-9_-]/g, '-')}`;

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

const handleCanvasMouseLeave = () => {
  handleMouseUp();
  hoveredEdge.value = null;
  hoveredFoldEdge.value = null;
  hoveredFaceId.value = null;
};

const clampMenuPoint = (x, y) => {
  if (!process.client) return { x, y };
  const padding = 100;
  return {
    x: Math.min(Math.max(x, padding), window.innerWidth - padding),
    y: Math.min(Math.max(y, padding), window.innerHeight - padding)
  };
};

const requestDesignerAction = async (edgeIndex, edge, event = null) => {
  await nextTick();
  const resolvedEdgeIndex = edge?.edgeIndex ?? edgeIndex;
  let clamped = event
    ? clampMenuPoint(event.clientX, event.clientY)
    : clampMenuPoint(edge.midX, edge.midY);

  try {
    const matrix = svgElement.value?.getScreenCTM?.();
    if (svgElement.value && matrix) {
      const point = svgElement.value.createSVGPoint();
      point.x = edge.midX;
      point.y = edge.midY;
      const screenPoint = point.matrixTransform(matrix);
      clamped = clampMenuPoint(screenPoint.x, screenPoint.y);
    }
  } catch {
    // Pointer event coordinates are sufficient for designer action placement.
  }

  emit('designer-action', {
    type: 'add-geometry',
    edgeIndex: resolvedEdgeIndex,
    edge: { ...edge, edgeIndex: resolvedEdgeIndex },
    screenX: clamped.x,
    screenY: clamped.y
  });
};

const requestDesignerFaceSelect = (face) => {
  emit('designer-face-select', {
    type: 'select-face',
    face
  });
};

const requestDesignerFoldSelect = (fold) => {
  emit('designer-fold-select', {
    type: 'select-fold',
    fold
  });
};

const isDesignerFaceActive = (face) => (
  face?.nodeId === hoveredFaceId.value ||
  face?.nodeId === props.selectedDesignerFaceId
);

const designerFaceOpacity = (face) => {
  if (face?.nodeId === hoveredFaceId.value) return 0.12;
  if (face?.nodeId === props.selectedDesignerFaceId) return 0.08;
  return 0.001;
};

const isDesignerFoldActive = (fold, index) => (
  hoveredFoldEdge.value === index ||
  fold?.foldNodeId === props.selectedDesignerFaceId
);

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
      <aside v-if="showLayerPanel && hasLayers" class="flex w-72 shrink-0 flex-col border-r border-content-border">
        <div class="border-b border-content-border p-3">
          <ActionToolbar :title="$t('common.layers')" :level="3">
            <template #title>
              <div class="flex min-w-0 items-center gap-2">
                <i class="pi pi-list text-muted-color" aria-hidden="true" />
                <span class="truncate">{{ $t('common.layers') }}</span>
                <Tag :value="visibleLayerSummary" severity="secondary" size="small" />
              </div>
            </template>
            <template #actions>
              <div class="flex items-center gap-1">
                <Button
                  icon="pi pi-eye"
                  text
                  rounded
                  size="small"
                  severity="secondary"
                  :aria-label="$t('drawing.showAllLayers')"
                  :disabled="allLayersVisible"
                  v-tooltip.top="$t('drawing.showAllLayers')"
                  @click="showAllLayers"
                />
                <Button
                  icon="pi pi-eye-slash"
                  text
                  rounded
                  size="small"
                  severity="secondary"
                  :aria-label="$t('drawing.hideAllLayers')"
                  :disabled="visibleLayerSelection.length === 0"
                  v-tooltip.top="$t('drawing.hideAllLayers')"
                  @click="hideAllLayers"
                />
              </div>
            </template>
          </ActionToolbar>
        </div>

        <ScrollPanel class="min-h-0 flex-1">
          <div class="flex flex-col">
            <div
              v-for="row in layerPanelRows"
              :key="row.key"
              class="flex items-start gap-3 border-b border-content-border px-3 py-3 last:border-b-0"
            >
              <Checkbox v-model="visibleLayerSelection" :value="row.layer.name" :inputId="layerInputId(row.layer)" size="small" class="mt-1" />
              <div class="flex min-w-0 flex-1 flex-col gap-2">
                <label :for="layerInputId(row.layer)" class="min-w-0">
                  <IdentityBlock :entity="row.sourceEntity" variant="compact" :fields="row.layer.standardCode ? ['slug'] : []" />
                </label>
                <LayerStandardCard v-if="row.standard" :standard="row.standard" variant="inline" />
                <PenTemplateCard v-if="row.pen" :pen="row.pen" variant="inline" />
              </div>
            </div>
          </div>
        </ScrollPanel>
      </aside>

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
          @mouseleave="handleCanvasMouseLeave"
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
              <image
                v-if="pathKind(path) === 'image'"
                :href="path.href"
                :x="path.x ?? 0"
                :y="path.y ?? 0"
                :width="path.width ?? 100"
                :height="path.height ?? 100"
                preserveAspectRatio="xMidYMid meet"
              />
              <g v-else-if="isRawSvg(path)" v-html="path" />
              <text
                v-else-if="pathKind(path) === 'text'"
                :x="path.x ?? 0"
                :y="path.y ?? 0"
                :fill="pathFill(path, layer)"
                :font-size="path.fontSize || 12"
                :text-anchor="path.textAnchor || 'middle'"
                :dominant-baseline="path.dominantBaseline || 'middle'"
                :transform="path.transform || null"
                stroke="none"
                class="select-none"
              >
                {{ path.text }}
              </text>
              <path
                v-else
                :d="pathD(path)"
                :fill="pathFill(path, layer)"
                :stroke="pathStroke(path, layer)"
                :opacity="pathOpacity(path)"
                vector-effect="non-scaling-stroke"
              />
            </template>
          </g>

          <g v-if="isDesigner">
            <path
              v-for="face in drawing.designerFaces || []"
              :key="`face-hit-${face.nodeId}`"
              :d="face.d"
              fill="currentColor"
              :opacity="designerFaceOpacity(face)"
              :stroke="isDesignerFaceActive(face) ? 'currentColor' : 'none'"
              :stroke-width="isDesignerFaceActive(face) ? displayStrokeWidth(1) : null"
              pointer-events="fill"
              vector-effect="non-scaling-stroke"
              class="cursor-pointer"
              @mouseenter="hoveredFaceId = face.nodeId"
              @mouseleave="hoveredFaceId = null"
              @click.stop.prevent="requestDesignerFaceSelect(face)"
            />
            <g v-for="(fold, index) in drawing.designerFoldEdges || []" :key="`fold-edge-${index}`">
              <line
                :x1="fold.x1"
                :y1="fold.y1"
                :x2="fold.x2"
                :y2="fold.y2"
                stroke="currentColor"
                opacity="0.001"
                stroke-width="22"
                stroke-linecap="round"
                pointer-events="stroke"
                class="cursor-pointer"
                @mouseenter="hoveredFoldEdge = index"
                @mouseleave="hoveredFoldEdge = null"
                @click.stop.prevent="requestDesignerFoldSelect(fold)"
              />
              <g
                v-if="isDesignerFoldActive(fold, index)"
                :transform="`translate(${fold.midX}, ${fold.midY})`"
                class="cursor-pointer select-none"
                @mouseenter="hoveredFoldEdge = index"
                @mouseleave="hoveredFoldEdge = null"
                @click.stop.prevent="requestDesignerFoldSelect(fold)"
              >
                <rect :x="-28" :y="-10" :width="56" :height="20" rx="10" fill="currentColor" class="opacity-85" />
                <text text-anchor="middle" dominant-baseline="middle" class="fill-muted-color text-xs">
                  {{ fold.label || fold.angle }}
                </text>
              </g>
            </g>
            <g v-for="(edge, index) in drawing.designerEdges || []" :key="`edge-${index}`">
              <line
                :x1="edge.x1"
                :y1="edge.y1"
                :x2="edge.x2"
                :y2="edge.y2"
                stroke="currentColor"
                opacity="0.001"
                stroke-width="20"
                stroke-linecap="round"
                pointer-events="stroke"
                class="cursor-pointer"
                @mouseenter="hoveredEdge = index"
                @mouseleave="hoveredEdge = null"
                @click.stop.prevent="requestDesignerAction(edge.edgeIndex ?? index, edge, $event)"
              />
              <g
                v-if="hoveredEdge === index"
                :transform="`translate(${edge.midX}, ${edge.midY})`"
                class="cursor-pointer select-none"
                @mouseenter="hoveredEdge = index"
                @mouseleave="hoveredEdge = null"
                @click.stop.prevent="requestDesignerAction(edge.edgeIndex ?? index, edge, $event)"
              >
                <rect :x="-10" :y="-10" :width="20" :height="20" rx="10" fill="currentColor" class="opacity-90" />
                <text text-anchor="middle" dominant-baseline="middle" class="fill-muted-color text-xs">
                  +
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
