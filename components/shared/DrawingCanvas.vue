<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
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
import { normalizeSketchDrawing, parseScene } from '~/utils/sketch.js';
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
  designerSelectableWorkpieceIds: { type: Array, default: null },
  showDesignerWorkpieceContext: { type: Boolean, default: false },
  visibleLayerNames: { type: Array, default: null },
  defaultPen: { type: Object, default: () => DEFAULT_DRAWING_PEN },
  highlightedExtrusionIndex: { type: Number, default: null }
});

const emit = defineEmits([
  'ready',
  'error',
  'layer-toggle',
  'designer-action',
  'designer-face-select',
  'designer-fold-select',
  'designer-face-command',
  'designer-point-edit',
  'designer-section-edit',
  'designer-fold-angle-edit'
]);

const standardsStore = useLayerStandardsStore();
const pensStore = usePenTemplatesStore();
const { standards } = storeToRefs(standardsStore);
const { pens, systemPens } = storeToRefs(pensStore);

const loading = ref(false);
const error = ref(null);
const drawing = ref(null);
const visibleLayers = ref([]);
const svgElement = ref(null);
const svgViewport = ref({ width: 0, height: 0 });
const viewBox = ref({ x: 0, y: 0, width: 100, height: 100 });
const isPanning = ref(false);
const panStart = ref({ x: 0, y: 0 });
const hoveredEdge = ref(null);
const hoveredFoldEdge = ref(null);
const hoveredFaceId = ref(null);
const activeSectionDrag = ref(null);
let faceHoverClearTimer = null;
let svgResizeObserver = null;

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
const designerSectionLayerCode = computed(() => (
  drawing.value?.designerSections?.standardCode ||
  drawing.value?.designerSections?.layerName ||
  null
));
const hasVisibleDesignerSectionLayer = computed(() => {
  const code = designerSectionLayerCode.value;
  return Boolean(code) && visibleDrawingLayers.value.some(layer => (
    layer.name === code ||
    layer.standardCode === code ||
    layer.role === 'section'
  ));
});
const viewBoxValue = computed(() => `${viewBox.value.x} ${viewBox.value.y} ${viewBox.value.width} ${viewBox.value.height}`);
const canvasAspectClass = computed(() => {
  if (!['thumbnail', 'card'].includes(props.mode)) return '';
  return viewBox.value.height > viewBox.value.width * 1.15 ? 'aspect-[3/4]' : 'aspect-[5/3]';
});
const canvasFrameClass = computed(() => (
  ['thumbnail', 'card'].includes(props.mode) ? 'w-full' : 'h-full w-full'
));
const displayStrokeWidth = (weight, fallback = 1.5) => {
  const numericWeight = Number(weight);
  if (!Number.isFinite(numericWeight) || numericWeight <= 0) return fallback;
  return Math.max(1, Math.min(numericWeight * 2, 4));
};

const updateSvgViewport = () => {
  svgViewport.value = {
    width: svgElement.value?.clientWidth || 0,
    height: svgElement.value?.clientHeight || 0
  };
};

const bindSvgResizeObserver = () => {
  if (!process.client || typeof ResizeObserver === 'undefined') return;
  svgResizeObserver?.disconnect?.();
  svgResizeObserver = null;
  if (!svgElement.value) return;
  svgResizeObserver = new ResizeObserver(() => updateSvgViewport());
  svgResizeObserver.observe(svgElement.value);
  updateSvgViewport();
};

const parseViewBox = (value) => {
  const parts = String(value || '0 0 100 100').split(/\s+/).map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isFinite(part))) {
    return { x: 0, y: 0, width: 100, height: 100 };
  }
  return { x: parts[0], y: parts[1], width: Math.max(parts[2], 1), height: Math.max(parts[3], 1) };
};

const applyPreviewInset = (box) => {
  if (!['thumbnail', 'card'].includes(props.mode)) return box;
  const inset = Math.max(box.width, box.height) * 0.08;
  return {
    x: box.x - inset,
    y: box.y - inset,
    width: box.width + inset * 2,
    height: box.height + inset * 2
  };
};

const loadStores = async () => {
  await Promise.all([
    standardsStore.ensureStandards?.(),
    pensStore.ensurePens?.()
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
  const layers = Array.isArray(preview.layers) ? preview.layers : [];
  const layerData = Array.isArray(source?.data?.layerData)
    ? source.data.layerData
    : (Array.isArray(source?.data?.geometry?.data?.layerData) ? source.data.geometry.data.layerData : []);
  return [
    ...layers,
    ...layerData.map(layer => ({
      name: layer.layer || layer.name,
      standardCode: layer.standardCode || layer.code || layer.layer || layer.name
    }))
  ];
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

  if (props.sourceType === 'sketch') {
    const raw = typeof props.source === 'string'
      ? await fetchText(props.source)
      : JSON.stringify(props.source);
    return normalizeSketchDrawing(parseScene(raw));
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
    const previousViewBox = drawing.value?.viewBox;
    drawing.value = nextDrawing;
    if (!isLayerVisibilityControlled.value) {
      visibleLayers.value = nextDrawing?.layers?.map(layer => layer.name) || [];
    }
    if (!previousViewBox || previousViewBox !== nextDrawing?.viewBox) {
      viewBox.value = applyPreviewInset(parseViewBox(nextDrawing?.viewBox));
    }
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

watch(svgElement, async () => {
  await nextTick();
  bindSvgResizeObserver();
});

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
const pathFillRule = (path) => {
  if (typeof path === 'string') return null;
  return path.fillRule || path.fillrule || null;
};
const isDimensionLayer = (layer = {}) => (
  layer.standardCode === 'dimension.cassette' ||
  layer.name === 'dimension.cassette' ||
  layer.role === 'dimension'
);
const previewDimensionFontSize = computed(() => {
  const targetScreenPixels = 16;
  const viewportWidth = svgViewport.value.width || 0;
  const viewportHeight = svgViewport.value.height || 0;
  if (!viewportWidth || !viewportHeight) {
    const minSide = Math.min(viewBox.value.width || 0, viewBox.value.height || 0);
    return Math.max(18, Math.min(36, minSide * 0.055));
  }
  const userUnitsPerPixel = Math.max(
    (viewBox.value.width || 1) / viewportWidth,
    (viewBox.value.height || 1) / viewportHeight
  );
  return userUnitsPerPixel * targetScreenPixels;
});
const textFontSize = (path, layer) => {
  const base = Number(path?.fontSize) || 12;
  if (!['thumbnail', 'card'].includes(props.mode)) return base;
  if (!isDimensionLayer(layer)) return base;
  return previewDimensionFontSize.value;
};
const designerControlForPath = (path) => (
  typeof path === 'object' && path?.designerControl ? path.designerControl : null
);
const designerDimensionControls = computed(() => visibleDrawingLayers.value.flatMap(layer => (
  (layer.paths || []).flatMap((path) => {
    const control = pathKind(path) === 'text' ? designerControlForPath(path) : null;
    const label = String(path?.text ?? control?.value ?? '');
    if (!control || !label.trim()) return [];
    return [{
      ...control,
      x: Number(path.x) || 0,
      y: Number(path.y) || 0,
      label
    }];
  })
)));

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
  viewBox.value = applyPreviewInset(parseViewBox(drawing.value?.viewBox));
};

defineExpose({ zoomIn, zoomOut, resetView });
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
  if (activeSectionDrag.value) {
    const point = getPointFromEvent(event);
    if (!point) return;
    requestDesignerSectionEdit(
      activeSectionDrag.value,
      activeSectionDrag.value.orientation === 'horizontal' ? -point.y : point.x
    );
    event.preventDefault();
    return;
  }
  if (!isPanning.value || !svgElement.value) return;
  const dx = (event.clientX - panStart.value.x) * (viewBox.value.width / svgElement.value.clientWidth);
  const dy = (event.clientY - panStart.value.y) * (viewBox.value.height / svgElement.value.clientHeight);
  viewBox.value = { ...viewBox.value, x: viewBox.value.x - dx, y: viewBox.value.y - dy };
  panStart.value = { x: event.clientX, y: event.clientY };
};

const handleMouseUp = () => {
  isPanning.value = false;
  activeSectionDrag.value = null;
};

const handleDocumentMouseMove = (event) => {
  if (!activeSectionDrag.value && !isPanning.value) return;
  handleMouseMove(event);
};

const handleDocumentMouseUp = () => {
  handleMouseUp();
};

const handleCanvasMouseLeave = () => {
  handleMouseUp();
  hoveredEdge.value = null;
  hoveredFoldEdge.value = null;
  if (faceHoverClearTimer) window.clearTimeout(faceHoverClearTimer);
  faceHoverClearTimer = null;
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

const screenPointForCanvasPoint = (x, y, event = null) => {
  if (event) return clampMenuPoint(event.clientX, event.clientY);
  try {
    const matrix = svgElement.value?.getScreenCTM?.();
    if (svgElement.value && matrix) {
      const point = svgElement.value.createSVGPoint();
      point.x = x;
      point.y = y;
      const screenPoint = point.matrixTransform(matrix);
      return clampMenuPoint(screenPoint.x, screenPoint.y);
    }
  } catch {
    // Canvas coordinates are still enough for fallback placement.
  }
  return clampMenuPoint(x, y);
};

const requestDesignerFaceCommand = (face, command, event = null) => {
  emit('designer-face-command', {
    type: 'face-command',
    command,
    face,
    ...screenPointForCanvasPoint(face.center?.x || 0, face.center?.y || 0, event)
  });
};

const requestDesignerPointEdit = (control, event = null) => {
  emit('designer-point-edit', {
    type: 'point-edit',
    control,
    ...screenPointForCanvasPoint(control.x, control.y, event)
  });
};

const requestDesignerSectionEdit = (section, value) => {
  emit('designer-section-edit', {
    type: 'section-edit',
    section,
    value
  });
};

const startDesignerSectionDrag = (section, event) => {
  activeSectionDrag.value = section;
  const point = getPointFromEvent(event);
  if (point) {
    requestDesignerSectionEdit(
      section,
      section.orientation === 'horizontal' ? -point.y : point.x
    );
  }
  event.preventDefault();
};

const requestDesignerFoldSelect = (fold) => {
  emit('designer-fold-select', {
    type: 'select-fold',
    fold
  });
};

const requestDesignerFoldAngleEdit = (fold, event = null) => {
  emit('designer-fold-angle-edit', {
    type: 'fold-angle-edit',
    fold,
    ...screenPointForCanvasPoint(fold.midX, fold.midY, event)
  });
};

const setDesignerFaceHover = (nodeId) => {
  if (faceHoverClearTimer) window.clearTimeout(faceHoverClearTimer);
  faceHoverClearTimer = null;
  hoveredFaceId.value = nodeId;
};

const scheduleDesignerFaceHoverClear = (nodeId) => {
  if (faceHoverClearTimer) window.clearTimeout(faceHoverClearTimer);
  faceHoverClearTimer = window.setTimeout(() => {
    if (hoveredFaceId.value === nodeId) hoveredFaceId.value = null;
    faceHoverClearTimer = null;
  }, 40);
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

const isDesignerDimensionActive = (control) => (
  control?.nodeId === hoveredFaceId.value ||
  control?.nodeId === props.selectedDesignerFaceId
);

const visibleDesignerDimensionControls = computed(() => (
  designerDimensionControls.value.filter(isDesignerDimensionActive)
));

const selectableDesignerWorkpieceIds = computed(() => (
  Array.isArray(props.designerSelectableWorkpieceIds)
    ? new Set(props.designerSelectableWorkpieceIds.filter(Boolean))
    : null
));

const isDesignerFaceSelectable = (face) => (
  !selectableDesignerWorkpieceIds.value ||
  selectableDesignerWorkpieceIds.value.has(face?.workpieceId)
);

const visibleDesignerFaces = computed(() => (
  (drawing.value?.designerFaces || []).filter(isDesignerFaceSelectable)
));

const visibleDesignerAttachmentMarkers = computed(() => (
  props.showDesignerWorkpieceContext && !props.selectedDesignerFaceId
    ? drawing.value?.designerAttachmentMarkers || []
    : []
));

const sectionHandleCursor = (section) => (
  section?.orientation === 'horizontal' ? 'cursor-row-resize' : 'cursor-col-resize'
);

const controlValueLabel = (value) => {
  const text = String(value ?? '');
  return text.length > 5 ? `${text.slice(0, 4)}...` : text;
};

const faceInlineControls = (face) => face.offsetControls || [];

const controlChipWidth = (control) => {
  const text = controlValueLabel(control.value);
  return Math.max(26, Math.min(48, text.length * 6 + 14));
};

const controlChipRect = (control) => {
  const width = controlChipWidth(control);
  return { x: -width / 2, y: -8, width };
};

const dimensionControlWidth = (control) => {
  const text = String(control?.label || control?.value || '');
  return Math.max(34, Math.min(72, text.length * 7 + 18));
};

const dimensionControlRect = (control) => {
  const width = dimensionControlWidth(control);
  return { x: -width / 2, y: -10, width };
};

onMounted(() => {
  if (!process.client) return;
  window.document.addEventListener('mousemove', handleDocumentMouseMove);
  window.document.addEventListener('mouseup', handleDocumentMouseUp);
  nextTick(() => bindSvgResizeObserver());
});

onBeforeUnmount(() => {
  resolveToken += 1;
  if (faceHoverClearTimer) window.clearTimeout(faceHoverClearTimer);
  svgResizeObserver?.disconnect?.();
  svgResizeObserver = null;
  if (!process.client) return;
  window.document.removeEventListener('mousemove', handleDocumentMouseMove);
  window.document.removeEventListener('mouseup', handleDocumentMouseUp);
});
</script>

<template>
  <div
    class="relative flex overflow-hidden"
    :class="[isDesigner ? '' : 'rounded-ui border border-content-border bg-subtle', canvasFrameClass, canvasAspectClass]"
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
              <!-- Data-driven exception: source drawing text size is geometry. -->
              <text
                v-else-if="pathKind(path) === 'text'"
                :x="path.x ?? 0"
                :y="path.y ?? 0"
                :fill="pathFill(path, layer)"
                :font-size="textFontSize(path, layer)"
                :text-anchor="path.textAnchor || 'middle'"
                :dominant-baseline="path.dominantBaseline || 'middle'"
                :transform="path.transform || null"
                pointer-events="none"
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
                :fill-rule="pathFillRule(path)"
                vector-effect="non-scaling-stroke"
              />
            </template>
          </g>

          <g v-if="isDesigner">
            <path
              v-for="face in visibleDesignerFaces"
              :key="`face-hit-${face.nodeId}`"
              :d="face.d"
              fill="currentColor"
              :opacity="designerFaceOpacity(face)"
              :stroke="isDesignerFaceActive(face) ? 'currentColor' : 'none'"
              :stroke-width="isDesignerFaceActive(face) ? displayStrokeWidth(1) : null"
              pointer-events="fill"
              vector-effect="non-scaling-stroke"
              class="cursor-pointer"
              @mouseenter="setDesignerFaceHover(face.nodeId)"
              @mouseleave="scheduleDesignerFaceHoverClear(face.nodeId)"
              @click.stop.prevent="requestDesignerFaceSelect(face)"
            />

            <g v-if="visibleDesignerAttachmentMarkers.length" pointer-events="none">
              <g
                v-for="marker in visibleDesignerAttachmentMarkers"
                :key="marker.id"
                :transform="`translate(${marker.x}, ${marker.y})`"
                class="select-none"
              >
                <circle
                  r="7"
                  fill="currentColor"
                  :fill-opacity="marker.active ? 0.92 : 0.36"
                />
                <circle
                  r="11"
                  fill="none"
                  stroke="currentColor"
                  :stroke-opacity="marker.active ? 0.7 : 0.24"
                  stroke-width="1.2"
                  vector-effect="non-scaling-stroke"
                />
                <text text-anchor="middle" dominant-baseline="middle" class="fill-[var(--p-content-background)] text-supporting">
                  {{ marker.label }}
                </text>
              </g>
            </g>

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
                @click.stop.prevent="requestDesignerFoldAngleEdit(fold, $event)"
              >
                <rect :x="-22" :y="-10" :width="44" :height="20" rx="10" fill="currentColor" class="opacity-90" />
                <text text-anchor="middle" dominant-baseline="middle" class="fill-[var(--p-content-background)] text-supporting">
                  {{ fold.label || fold.angle }}
                </text>
              </g>
            </g>

            <line
              v-for="section in hasVisibleDesignerSectionLayer ? (drawing.designerSections?.handles || []) : []"
              :key="`section-handle-hit-${section.orientation}`"
              :x1="section.x1"
              :y1="section.y1"
              :x2="section.x2"
              :y2="section.y2"
              stroke="currentColor"
              opacity="0.001"
              stroke-width="22"
              stroke-linecap="round"
              pointer-events="stroke"
              vector-effect="non-scaling-stroke"
              :class="sectionHandleCursor(section)"
              @mousedown.stop.prevent="startDesignerSectionDrag(section, $event)"
            />

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
                <text text-anchor="middle" dominant-baseline="middle" class="fill-[var(--p-content-background)] text-supporting">
                  +
                </text>
              </g>
            </g>

            <g
              v-for="control in visibleDesignerDimensionControls"
              :key="`dimension-control-${control.nodeId}-${control.key}-${control.dimensionKind || ''}`"
              :transform="`translate(${control.x}, ${control.y})`"
              class="cursor-pointer select-none"
              @mouseenter="setDesignerFaceHover(control.nodeId)"
              @mouseleave="scheduleDesignerFaceHoverClear(control.nodeId)"
              @click.stop.prevent="requestDesignerPointEdit(control, $event)"
            >
              <rect
                :x="dimensionControlRect(control).x"
                :y="dimensionControlRect(control).y"
                :width="dimensionControlRect(control).width"
                height="20"
                rx="10"
                fill="currentColor"
                class="opacity-90"
              />
              <text text-anchor="middle" dominant-baseline="middle" class="fill-[var(--p-content-background)] text-supporting">
                {{ control.label || control.value }}
              </text>
            </g>

            <template v-for="face in drawing.designerFaces || []" :key="`face-controls-${face.nodeId}`">
              <g
                v-if="face.nodeId === selectedDesignerFaceId"
                :transform="`translate(${face.center?.x || 0}, ${face.center?.y || 0})`"
                class="select-none"
              >
                <g
                  class="cursor-pointer"
                  @click.stop.prevent="requestDesignerFaceCommand(face, 'menu', $event)"
                >
                  <rect x="-14" y="-14" width="28" height="28" rx="14" fill="currentColor" class="opacity-90" />
                  <text y="-3" text-anchor="middle" dominant-baseline="middle" class="fill-[var(--p-content-background)] text-body">
                    ...
                  </text>
                </g>
              </g>
              <template v-if="face.nodeId === selectedDesignerFaceId">
                <g
                  v-for="control in faceInlineControls(face)"
                  :key="`${face.nodeId}-${control.key}`"
                  :transform="`translate(${control.x}, ${control.y})`"
                  class="cursor-pointer select-none"
                  @click.stop.prevent="requestDesignerPointEdit(control, $event)"
                >
                  <rect
                    :x="controlChipRect(control).x"
                    :y="controlChipRect(control).y"
                    :width="controlChipRect(control).width"
                    height="16"
                    rx="8"
                    fill="currentColor"
                    class="opacity-90"
                  />
                  <text
                    :x="controlChipRect(control).x + controlChipRect(control).width / 2"
                    :y="controlChipRect(control).y + 8"
                    text-anchor="middle"
                    dominant-baseline="middle"
                    class="fill-[var(--p-content-background)] text-supporting"
                  >
                    {{ controlValueLabel(control.value) }}
                  </text>
                </g>
              </template>
            </template>
          </g>
        </svg>

        <div v-if="isViewer && !isDesigner" class="absolute bottom-4 right-4 flex gap-2">
          <Button icon="pi pi-search-minus" rounded severity="secondary" :aria-label="$t('drawing.zoomOut')" @click="zoomOut" />
          <Button icon="pi pi-refresh" rounded severity="secondary" :aria-label="$t('drawing.resetView')" @click="resetView" />
          <Button icon="pi pi-search-plus" rounded severity="secondary" :aria-label="$t('drawing.zoomIn')" @click="zoomIn" />
        </div>
      </div>
    </template>
  </div>
</template>
