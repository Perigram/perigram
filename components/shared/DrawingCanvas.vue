<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import ProgressSpinner from 'primevue/progressspinner';
import ScrollPanel from 'primevue/scrollpanel';
import Tag from 'primevue/tag';
import { generateSvgData } from '~/utils/dxfParser';
import {
  DEFAULT_DRAWING_PEN,
  applyLayerPens,
  normalizeGeometryDrawing
} from '~/utils/drawingPreview';
import { normalizeSketchDrawing, parseScene } from '~/utils/sketch.js';
import { useLayerStandardsStore } from '~/stores/layerStandards';
import { usePenTemplatesStore } from '~/stores/penTemplates';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import { DESIGN_SYSTEM_CARD_COMPONENTS } from '~/utils/design-system-cards.js';

const LayerStandardCard = DESIGN_SYSTEM_CARD_COMPONENTS.layerStandard;
const PenTemplateCard = DESIGN_SYSTEM_CARD_COMPONENTS.penTemplate;

const props = defineProps({
  source: { type: [Object, String], default: null },
  sourceType: { type: String, default: 'geometry-preview' },
  mode: { type: String, default: 'card' },
  // Fill mode: the canvas fills its container bounds exactly (h-full
  // w-full, no aspect-ratio height, no own border/background — the host
  // card owns the chrome) and the SVG scales to cover or contain per
  // source: bitmap-like sketch scenes fill (uniform scale, cropped),
  // vector drawings fit. Card preview bands (fixed-height headers) opt
  // in; standalone thumbnails keep their aspect-driven frame.
  // Card/thumbnail modes enlarge dimension text for tile readability; the
  // unified OCCS preview keeps the enlargement in card bands but opts out
  // in the interactive pane viewer to match that canvas pixel-for-pixel.
  scaleDimensionText: { type: Boolean, default: true },
  fill: { type: Boolean, default: false },
  layerMapping: { type: Object, default: () => ({}) },
  showLayerPanel: { type: Boolean, default: false },
  selectedDesignerFaceId: { type: String, default: null },
  selectedDesignerProfileId: { type: String, default: null },
  designerProfileSelectable: { type: Boolean, default: true },
  designerSelectableWorkpieceIds: { type: Array, default: null },
  // Designer mode with the authoring affordances off (a read grant): the
  // free-shard +, the fold-angle control, the section drag handles, and
  // the dimension edit targets stay hidden; selection rides on.
  designerEditable: { type: Boolean, default: true },
  showDesignerWorkpieceContext: { type: Boolean, default: false },
  visibleLayerNames: { type: Array, default: null },
  defaultPen: { type: Object, default: () => DEFAULT_DRAWING_PEN },
  highlightedExtrusionIndex: { type: Number, default: null },
  // Sticky viewport for editing surfaces: the first resolved drawing fits
  // the view, and later source changes (live edits re-rendering bounds)
  // keep the user's pan/zoom instead of refitting — the toolbar's reset
  // view is the explicit refit. Default refits whenever the drawing's
  // viewBox changes (previews, read-only panes).
  preserveViewport: { type: Boolean, default: false },
  // A host-owned renderer paints the geometry behind this canvas; the SVG
  // keeps the interaction overlays and the camera, including the host's
  // dimension labels and their transparent edit targets.
  showGeometry: { type: Boolean, default: true },
  // CadCraft navigation: wheel zooms at the cursor with the engine's
  // exponential step, middle or right drag pans. Editing surfaces that
  // share a CadCraft host use the same gestures in both modes.
  cadcraftNavigation: { type: Boolean, default: false }
});

const emit = defineEmits([
  'ready',
  'error',
  'layer-toggle',
  'designer-action',
  'designer-face-select',
  'designer-profile-select',
  'designer-fold-select',
  'designer-point-edit',
  'designer-section-edit',
  'designer-fold-angle-edit',
  'view-change'
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
const hoveredProfileId = ref(null);
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
const standardCode = (standard) => standard?.fields?.code || null;
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
  // Layer identity is dual-key: the display name (production export
  // name) or the stable standardCode — preview surfaces select by code,
  // authoring surfaces by name, both match the same layers.
  return drawing.value.layers.filter(layer => visibleLayerSelection.value.includes(layer.name)
    || (layer.standardCode && visibleLayerSelection.value.includes(layer.standardCode)));
});
// Layer-row identity meta (the slug fact under the layer name), built in
// script like every other identity meta line so template copy stays i18n.
function layerRowMetaText(row) {
  if (!row?.layer?.standardCode) return '';
  const slug = row.sourceEntity?.identity?.slug;
  return slug ? `slug: ${slug}` : '';
}
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
  if (props.fill) return '';
  if (!['thumbnail', 'card'].includes(props.mode)) return '';
  return viewBox.value.height > viewBox.value.width * 1.15 ? 'aspect-[3/4]' : 'aspect-[5/3]';
});
const canvasFrameClass = computed(() => {
  if (props.fill) return 'h-full w-full';
  return ['thumbnail', 'card'].includes(props.mode) ? 'w-full' : 'h-full w-full';
});
// Fill/fit policy for the canvas SVG: sketch scenes are bitmap-like and
// fill the frame (uniform scale, cropped overflow); vector drawings
// (dxf/svg/occs layers) fit inside it. Slice applies only to fill hosts
// — standalone viewers never crop user content.
const canvasPreserveAspectRatio = computed(() => (
  props.fill && props.sourceType === 'sketch' ? 'xMidYMid slice' : 'xMidYMid meet'
));
// Pen weights render at a fixed px-per-pen-unit scale, bounded for
// visibility — the layer standards' relative weights survive.
const displayStrokeWidth = (weight, fallback = 1.5) => {
  const numericWeight = Number(weight);
  if (!Number.isFinite(numericWeight) || numericWeight <= 0) return fallback;
  return Math.max(0.5, Math.min(numericWeight * 2, 4));
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
  const parts = value && typeof value === 'object'
    ? [value.x, value.y, value.width, value.height]
    : String(value || '0 0 100 100').split(/\s+/).map(Number);
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
    ['dxf-text', 'dxf-url'].includes(props.sourceType) ||
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
    const previousHadGeometry = Boolean(drawing.value?.layers?.length);
    drawing.value = nextDrawing;
    if (!isLayerVisibilityControlled.value) {
      visibleLayers.value = nextDrawing?.layers?.map(layer => layer.name) || [];
    }
    const nextHasGeometry = Boolean(nextDrawing?.layers?.length);
    if (!previousViewBox
      || (previousViewBox !== nextDrawing?.viewBox && !props.preserveViewport)
      || (!previousHadGeometry && nextHasGeometry)) {
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
  layer.role === 'dimension' || /^dimension(\.|$)/i.test(String(layer.name || ''))
);
const canvasUnitsPerPixel = computed(() => {
  const viewportWidth = svgViewport.value.width || 0;
  const viewportHeight = svgViewport.value.height || 0;
  if (!viewportWidth || !viewportHeight) {
    const minSide = Math.min(viewBox.value.width || 0, viewBox.value.height || 0);
    return Math.max(18, Math.min(36, minSide * 0.055)) / 16;
  }
  return Math.max(
    (viewBox.value.width || 1) / viewportWidth,
    (viewBox.value.height || 1) / viewportHeight
  );
});
const designerSize = (pixels) => canvasUnitsPerPixel.value * pixels;
const previewDimensionFontSize = computed(() => designerSize(16));
const textFontSize = (path, layer) => {
  const base = Number(path?.fontSize) || 12;
  if (!['thumbnail', 'card'].includes(props.mode)) return base;
  if (!props.scaleDimensionText) return base;
  if (!isDimensionLayer(layer)) return base;
  return previewDimensionFontSize.value;
};
const designerControlForPath = (path) => (
  typeof path === 'object' && path?.designerControl ? path.designerControl : null
);
const pathDimensionControls = computed(() => visibleDrawingLayers.value.flatMap(layer => (
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
// Native dimension annotations are model-space rows; the SVG edit
// target sits where the host paints the label.
const annotationDimensionControls = computed(() => (
  props.showGeometry
    ? []
    : (drawing.value?.dimensionAnnotations || []).flatMap((annotation) => {
      const loc = annotation?.loc;
      const control = annotation?.nodeId
        ? { nodeId: annotation.nodeId, key: annotation.key, dimensionKind: annotation.dimensionKind }
        : null;
      const label = String(annotation?.text ?? '');
      if (!control || !label.trim() || !Array.isArray(loc) || loc.length < 2) return [];
      return [{
        ...control,
        selectionType: annotation.selectionType,
        targetId: annotation.targetId,
        shapeId: annotation.shapeId,
        shapeIds: annotation.shapeIds,
        fieldKey: annotation.fieldKey,
        value: label,
        label,
        x: Number(loc[0]) || 0,
        y: -(Number(loc[1]) || 0)
      }];
    })
));
const designerDimensionControls = computed(() => {
  const annotated = annotationDimensionControls.value;
  return annotated.length ? annotated : pathDimensionControls.value;
});

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

// CadCraft's wheel-pad law: touchpad-style scrolls (fractional or small
// deltas, sideways movement) pan; notched mouse wheels zoom.
const isCadcraftSwipe = (event) => {
  if (event.ctrlKey || event.deltaMode !== 0) return false;
  const dx = event.deltaX || 0;
  const dy = event.deltaY || 0;
  const notched = dx === 0 && (
    (Number.isFinite(event.wheelDeltaY) && event.wheelDeltaY !== 0 && event.wheelDeltaY % 120 === 0)
    || (Number.isInteger(dy) && Math.abs(dy) >= 50)
  );
  if (notched) return false;
  return dx !== 0 || !Number.isInteger(dy) || Math.abs(dy) < 50;
};

// Screen-pixel pan (the scroll metaphor: content follows the fingers).
const panByScreenDelta = (dx, dy) => {
  if (!svgElement.value) return;
  viewBox.value = {
    ...viewBox.value,
    x: viewBox.value.x + dx * (viewBox.value.width / svgElement.value.clientWidth),
    y: viewBox.value.y + dy * (viewBox.value.height / svgElement.value.clientHeight)
  };
};

const handleWheel = (event) => {
  if (!isViewer.value) return;
  event.preventDefault();
  if (props.cadcraftNavigation && isCadcraftSwipe(event)) {
    panByScreenDelta(event.deltaX, event.deltaY);
    return;
  }
  const step = event.deltaMode === 1 ? event.deltaY * 33 : event.deltaY;
  const factor = props.cadcraftNavigation
    ? Math.pow(1.0018, step)
    : (event.deltaY > 0 ? 1.1 : 0.9);
  zoomAt(getPointFromEvent(event), factor);
};

const zoomIn = () => zoomAt(null, 0.8);
const zoomOut = () => zoomAt(null, 1.25);
const resetView = () => {
  viewBox.value = applyPreviewInset(parseViewBox(drawing.value?.viewBox));
};

// Camera handoff for hosts that own one canvas session across renderers:
// the host stores the box before a mode flip and writes it back on return.
const getViewBox = () => ({ ...viewBox.value });
const setViewBox = (box) => {
  viewBox.value = parseViewBox(box);
};
const getViewportSize = () => ({ ...svgViewport.value });

watch(viewBox, (box) => {
  emit('view-change', { ...box });
}, { deep: true });

defineExpose({ zoomIn, zoomOut, resetView, getViewBox, setViewBox, getViewportSize });
const showAllLayers = () => {
  visibleLayerSelection.value = [...layerNames.value];
};
const hideAllLayers = () => {
  visibleLayerSelection.value = [];
};
const layerInputId = (layer) => `drawing-layer-${String(layer.name).replace(/[^A-Za-z0-9_-]/g, '-')}`;

const handleMouseDown = (event) => {
  if (!isViewer.value) return;
  const cadcraftPan = props.cadcraftNavigation && (event.button === 1 || event.button === 2);
  const viewerPan = !props.cadcraftNavigation
    && event.button === 0
    && (!isDesigner.value || event.shiftKey);
  if (!cadcraftPan && !viewerPan) return;
  isPanning.value = true;
  panStart.value = { x: event.clientX, y: event.clientY };
  event.preventDefault();
};

const handleContextMenu = (event) => {
  if (props.cadcraftNavigation) event.preventDefault();
};

const handleAuxClick = (event) => {
  if (!props.cadcraftNavigation || event.button !== 1 || event.detail !== 2) return;
  resetView();
};

// --- Touch gestures: viewer canvases pan with one finger; two fingers
// pinch-zoom and pan both viewer and designer canvases (the designer keeps
// single-finger taps for face/edge interaction). ---
const touchPan = ref(null);
const pinchGesture = ref(null);

const touchPoints = (first, second) => ({
  distance: Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY) || 1,
  center: { x: (first.clientX + second.clientX) / 2, y: (first.clientY + second.clientY) / 2 }
});

const handleTouchStart = (event) => {
  if (!isViewer.value) return;
  if (event.touches.length === 2) {
    pinchGesture.value = { ...touchPoints(event.touches[0], event.touches[1]), viewBox: { ...viewBox.value } };
    touchPan.value = null;
    event.preventDefault();
    return;
  }
  if (event.touches.length === 1 && !isDesigner.value) {
    touchPan.value = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    event.preventDefault();
  }
};

const handleTouchMove = (event) => {
  if (!isViewer.value) return;
  if (pinchGesture.value && event.touches.length >= 2) {
    event.preventDefault();
    const rect = svgElement.value?.getBoundingClientRect();
    if (!rect) return;
    const start = pinchGesture.value;
    const points = touchPoints(event.touches[0], event.touches[1]);
    const scale = start.distance / points.distance;
    const width = start.viewBox.width * scale;
    const height = start.viewBox.height * scale;
    const focusX = start.viewBox.x + ((start.center.x - rect.left) / rect.width) * start.viewBox.width;
    const focusY = start.viewBox.y + ((start.center.y - rect.top) / rect.height) * start.viewBox.height;
    viewBox.value = {
      x: focusX - ((points.center.x - rect.left) / rect.width) * width,
      y: focusY - ((points.center.y - rect.top) / rect.height) * height,
      width,
      height
    };
    return;
  }
  if (touchPan.value && event.touches.length === 1 && svgElement.value) {
    event.preventDefault();
    const touch = event.touches[0];
    const dx = (touch.clientX - touchPan.value.x) * (viewBox.value.width / svgElement.value.clientWidth);
    const dy = (touch.clientY - touchPan.value.y) * (viewBox.value.height / svgElement.value.clientHeight);
    viewBox.value = { ...viewBox.value, x: viewBox.value.x - dx, y: viewBox.value.y - dy };
    touchPan.value = { x: touch.clientX, y: touch.clientY };
  }
};

const handleTouchEnd = (event) => {
  if (event.touches.length === 0) touchPan.value = null;
  if (event.touches.length < 2) pinchGesture.value = null;
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

const requestDesignerProfileSelect = (profile, event = null) => {
  emit('designer-profile-select', {
    type: 'select-profile',
    profile,
    clientX: event?.clientX,
    clientY: event?.clientY
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

const isDesignerProfileActive = (profile) => (
  profile?.workpieceId === hoveredProfileId.value ||
  profile?.workpieceId === props.selectedDesignerProfileId
);

const designerProfileOpacity = (profile) => {
  if (profile?.workpieceId === hoveredProfileId.value) return 0.12;
  if (profile?.workpieceId === props.selectedDesignerProfileId) return 0.08;
  return 0.001;
};

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
  props.showGeometry
    ? designerDimensionControls.value.filter(isDesignerDimensionActive)
    : designerDimensionControls.value
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

const dimensionControlWidth = (control) => {
  const text = String(control?.label || control?.value || '');
  return designerSize(Math.max(34, Math.min(72, text.length * 7 + 18)));
};

const dimensionControlRect = (control) => {
  const width = dimensionControlWidth(control);
  return {
    x: -width / 2,
    y: -designerSize(10),
    width,
    height: designerSize(20),
    rx: designerSize(10)
  };
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
    :class="[isDesigner ? '' : (props.fill ? '' : 'rounded-ui border border-content-border bg-subtle'), canvasFrameClass, canvasAspectClass]"
  >
    <div v-if="loading" class="flex h-full w-full items-center justify-center">
      <ProgressSpinner class="h-8 w-8" />
    </div>

    <div v-else-if="error || !drawing" class="flex h-full w-full items-center justify-center text-muted">
      <i :class="error ? 'pi pi-exclamation-circle' : 'pi pi-image'" />
    </div>

    <template v-else>
      <aside v-if="showLayerPanel && hasLayers" class="flex w-72 shrink-0 flex-col border-r border-content-border">
        <div class="border-b border-content-border p-3">
          <ActionToolbar :title="$t('common.layers')" :level="3">
            <template #title>
              <div class="flex min-w-0 items-center gap-2">
                <i class="pi pi-list text-muted" aria-hidden="true" />
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
                  <span class="flex min-w-0 flex-col">
                    <span class="truncate">{{ row.sourceEntity?.name }}</span>
                    <small v-if="layerRowMetaText(row)" class="truncate" :title="layerRowMetaText(row)">
                      {{ layerRowMetaText(row) }}
                    </small>
                  </span>
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
          :preserveAspectRatio="canvasPreserveAspectRatio"
          class="h-full w-full"
          :class="[
            isViewer ? 'touch-none' : '',
            isPanning ? 'cursor-grabbing' : isDesigner ? 'cursor-crosshair' : isViewer ? 'cursor-move' : ''
          ]"
          @mousedown="handleMouseDown"
          @mousemove="handleMouseMove"
          @mouseup="handleMouseUp"
          @mouseleave="handleCanvasMouseLeave"
          @contextmenu="handleContextMenu"
          @auxclick="handleAuxClick"
          @wheel="handleWheel"
          @touchstart="handleTouchStart"
          @touchmove="handleTouchMove"
          @touchend="handleTouchEnd"
          @touchcancel="handleTouchEnd"
        >
          <defs v-if="showGrid && showGeometry">
            <pattern id="drawing-canvas-grid" width="100" height="100" patternUnits="userSpaceOnUse">
              <path d="M 100 0 L 0 0 0 100" fill="none" stroke="currentColor" class="opacity-10" />
            </pattern>
          </defs>
          <rect v-if="showGrid && showGeometry" :x="viewBox.x" :y="viewBox.y" :width="viewBox.width" :height="viewBox.height" fill="url(#drawing-canvas-grid)" />

          <template v-if="showGeometry">
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
          </template>

          <g v-if="isDesigner">
            <path
              v-for="face in visibleDesignerFaces"
              :key="`face-hit-${face.nodeId}`"
              :d="face.d"
              fill="currentColor"
              :fill-opacity="showGeometry ? designerFaceOpacity(face) : (isDesignerFaceActive(face) ? 0.12 : 0)"
              :stroke="isDesignerFaceActive(face) ? 'currentColor' : 'none'"
              :stroke-width="isDesignerFaceActive(face) ? displayStrokeWidth(1) : null"
              pointer-events="fill"
              vector-effect="non-scaling-stroke"
              class="cursor-pointer"
              :data-designer-face-id="face.nodeId"
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
                  :r="designerSize(7)"
                  fill="currentColor"
                  :fill-opacity="marker.active ? 0.92 : 0.36"
                />
                <circle
                  :r="designerSize(11)"
                  fill="none"
                  stroke="currentColor"
                  :stroke-opacity="marker.active ? 0.7 : 0.24"
                  stroke-width="1.2"
                  vector-effect="non-scaling-stroke"
                />
                <text
                  text-anchor="middle"
                  dominant-baseline="middle"
                  :font-size="designerSize(12)"
                  class="fill-[var(--p-content-background)]"
                >
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
                vector-effect="non-scaling-stroke"
                class="cursor-pointer"
                @mouseenter="hoveredFoldEdge = index"
                @mouseleave="hoveredFoldEdge = null"
                @click.stop.prevent="requestDesignerFoldSelect(fold)"
              />
              <g
                v-if="designerEditable && isDesignerFoldActive(fold, index)"
                :transform="`translate(${fold.midX}, ${fold.midY})`"
                :class="designerEditable ? 'cursor-pointer select-none' : 'select-none'"
                @mouseenter="hoveredFoldEdge = index"
                @mouseleave="hoveredFoldEdge = null"
                @click.stop.prevent="designerEditable && requestDesignerFoldAngleEdit(fold, $event)"
              >
                <rect
                  :x="-designerSize(22)"
                  :y="-designerSize(10)"
                  :width="designerSize(44)"
                  :height="designerSize(20)"
                  :rx="designerSize(10)"
                  fill="currentColor"
                  class="opacity-90"
                />
                <text
                  text-anchor="middle"
                  dominant-baseline="middle"
                  :font-size="designerSize(12)"
                  class="fill-[var(--p-content-background)]"
                >
                  {{ fold.label || fold.angle }}
                </text>
              </g>
            </g>

            <line
              v-for="section in designerEditable && hasVisibleDesignerSectionLayer ? (drawing.designerSections?.handles || []) : []"
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

            <g v-for="(edge, index) in designerEditable ? (drawing.designerEdges || []) : []" :key="`edge-${index}`">
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
                vector-effect="non-scaling-stroke"
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
                <rect
                  :x="-designerSize(10)"
                  :y="-designerSize(10)"
                  :width="designerSize(20)"
                  :height="designerSize(20)"
                  :rx="designerSize(10)"
                  fill="currentColor"
                  class="opacity-90"
                />
                <text
                  text-anchor="middle"
                  dominant-baseline="middle"
                  :font-size="designerSize(14)"
                  class="fill-[var(--p-content-background)]"
                >
                  +
                </text>
              </g>
            </g>

            <g
              v-for="profile in drawing.designerProfiles || []"
              :key="`profile-hit-${profile.id}`"
              :class="designerProfileSelectable ? 'cursor-pointer' : ''"
              :data-designer-profile-id="profile.workpieceId"
              :data-designer-profile-relation-id="profile.relationId"
              @mouseenter="designerProfileSelectable && (hoveredProfileId = profile.workpieceId)"
              @mouseleave="hoveredProfileId = null"
              @click.stop.prevent="designerProfileSelectable && requestDesignerProfileSelect(profile, $event)"
            >
              <path
                v-if="!profile.open"
                :d="profile.d"
                fill="currentColor"
                :fill-opacity="showGeometry ? designerProfileOpacity(profile) : (isDesignerProfileActive(profile) ? 0.12 : 0)"
                stroke="none"
                :pointer-events="designerProfileSelectable ? 'fill' : 'none'"
                vector-effect="non-scaling-stroke"
              />
              <path
                :d="profile.d"
                fill="none"
                stroke="currentColor"
                opacity="0.001"
                stroke-width="18"
                stroke-linecap="round"
                stroke-linejoin="round"
                :pointer-events="designerProfileSelectable ? 'stroke' : 'none'"
                vector-effect="non-scaling-stroke"
              />
            </g>

            <g
              v-for="profile in drawing.designerProfiles || []"
              :key="`profile-outline-${profile.id}`"
              v-show="isDesignerProfileActive(profile)"
            >
              <path
                :d="profile.d"
                fill="none"
                stroke="currentColor"
                :stroke-width="displayStrokeWidth(1)"
                pointer-events="none"
                vector-effect="non-scaling-stroke"
              />
            </g>

            <g
              v-for="control in visibleDesignerDimensionControls"
              :key="`dimension-control-${control.nodeId}-${control.key}-${control.dimensionKind || ''}`"
              :transform="`translate(${control.x}, ${control.y})`"
              :class="designerEditable ? 'cursor-pointer select-none' : 'select-none'"
              @mouseenter="setDesignerFaceHover(control.nodeId)"
              @mouseleave="scheduleDesignerFaceHoverClear(control.nodeId)"
              @click.stop.prevent="designerEditable && requestDesignerPointEdit(control, $event)"
            >
              <rect
                v-if="!showGeometry"
                :x="dimensionControlRect(control).x"
                :y="dimensionControlRect(control).y"
                :width="dimensionControlRect(control).width"
                :height="dimensionControlRect(control).height"
                :rx="dimensionControlRect(control).rx"
                fill="transparent"
                :pointer-events="designerEditable ? 'all' : 'none'"
              />
              <template v-else>
                <rect
                  :x="dimensionControlRect(control).x"
                  :y="dimensionControlRect(control).y"
                  :width="dimensionControlRect(control).width"
                  :height="dimensionControlRect(control).height"
                  :rx="dimensionControlRect(control).rx"
                  fill="currentColor"
                  class="opacity-90"
                />
                <text
                  text-anchor="middle"
                  dominant-baseline="middle"
                  :font-size="designerSize(12)"
                  class="fill-[var(--p-content-background)]"
                >
                  {{ control.label || control.value }}
                </text>
              </template>
            </g>

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
