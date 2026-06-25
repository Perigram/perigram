<template>
  <div ref="container" class="w-full" data-entity-card-interactive="true" @click.stop>
    <DrawingCanvas
      v-if="canvasSource"
      :source="canvasSource"
      :source-type="canvasSourceType"
      :layer-mapping="canvasLayerMapping"
      :visible-layer-names="previewVisibleLayerNames"
      mode="thumbnail"
      @ready="handleDrawingReady"
    />
    <div v-else class="flex aspect-[5/3] w-full items-center justify-center rounded-ui border border-content-border bg-subtle text-muted-color">
      <i :class="loading ? 'pi pi-spin pi-spinner' : 'pi pi-image'" />
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, watch } from 'vue';
import DrawingCanvas from '~/components/shared/DrawingCanvas.vue';

const props = defineProps({
  cassetteId: {
    type: String,
    required: false
  },
  cassette: {
    type: Object,
    default: null
  },
  preferGeometry: {
    type: Boolean,
    default: false
  },
  dimensions: {
    type: Object,
    default: null
  }
});

const container = ref(null);
const isVisible = ref(false);
const loading = ref(false);
const canvasSource = ref(null);
const canvasSourceType = ref('geometry-preview');
const canvasLayerMapping = ref({});

let lastRenderKey = '';
const PREVIEW_LAYER_PRIORITY = [
  'cut.outer',
  'fold.route',
  'cut.inner',
  'cut.hole',
  'dimension.cassette'
];
const resolvedPreviewLayerNames = ref(null);

const cassetteType = (cassette) => cassette?.data?.type || '';
const cassetteDefinition = (cassette) => cassette?.data?.definition || {};
const isOccsCassetteDefinition = (definition) => Boolean(definition?.occs && definition?.documentType);
const cassetteMapping = (cassette) => cassetteDefinition(cassette)?.mapping || {};
const hasRenderableGeometry = (cassette) => Boolean(
  cassette?.data?.geometry?.dxfId ||
  cassette?.data?.geometry?.preview ||
  cassette?.data?.geometry?.data ||
  cassette?.data?.geometry?.points ||
  cassette?.data?.layerData?.length ||
  cassette?.data?.polygonParts?.length ||
  cassette?.data?.geometry?.data?.layerData?.length ||
  cassette?.data?.geometry?.data?.polygonParts?.length
);
const cassetteGraph = (cassette) => {
  const definition = cassetteDefinition(cassette);
  return {
    params: definition?.params || {},
    extrusions: Array.isArray(definition?.extrusions) ? definition.extrusions : [],
    layers: definition?.layers || definition?.layerRoles || {}
  };
};

const loadCassette = async () => {
  if (props.cassette) return props.cassette;
  const cid = props.cassetteId?.toString();
  if (!cid) return null;
  return await $fetch(`/api/cassette-designs/${cid}`).catch(() => $fetch(`/api/cassettes/${cid}`).catch(() => null));
};

const setDxfSource = (dxfId, mapping = {}) => {
  canvasSource.value = `/api/files/download/${dxfId}?bucket=cassettes`;
  canvasSourceType.value = 'dxf-url';
  canvasLayerMapping.value = mapping;
};

const setGeometrySource = (cassette) => {
  canvasSource.value = cassette;
  canvasSourceType.value = 'geometry-preview';
  canvasLayerMapping.value = {};
};

const setParametricSource = (graph) => {
  canvasSource.value = {
    params: {
      ...graph.params,
      ...(props.dimensions || {})
    },
    extrusions: graph.extrusions,
    layers: graph.layers || {}
  };
  canvasSourceType.value = 'parametric-cassette';
  canvasLayerMapping.value = {};
};

const setOccsSource = (definition) => {
  canvasSource.value = definition;
  canvasSourceType.value = 'occs-cassette';
  canvasLayerMapping.value = {};
};

const previewVisibleLayerNames = computed(() => resolvedPreviewLayerNames.value);

const handleDrawingReady = (drawing) => {
  const layerNames = Array.isArray(drawing?.layers)
    ? drawing.layers.map(layer => layer.name).filter(Boolean)
    : [];
  const allowed = PREVIEW_LAYER_PRIORITY.filter(name => layerNames.includes(name));
  resolvedPreviewLayerNames.value = allowed.length ? allowed : null;
};

const loadPreferredGeometryCassette = async (cassette) => {
  if (!props.preferGeometry) return cassette;
  if (!cassette?._id || hasRenderableGeometry(cassette)) return cassette;
  return await $fetch(`/api/cassette-designs/${encodeURIComponent(cassette._id)}`).catch(() => cassette);
};

const updateThumbnail = async () => {
  if (!isVisible.value) return;

  const currentKey = JSON.stringify([
    props.cassetteId,
    props.cassette?._id,
    props.cassette?.updatedAt,
    props.cassette?.data?.definition,
    props.cassette?.data?.geometry,
    props.cassette?.data?.layerData,
    props.cassette?.data?.polygonParts,
    props.cassette?.data?.geometry?.data?.layerData,
    props.cassette?.data?.geometry?.data?.polygonParts,
    props.dimensions
  ]);
  if (currentKey === lastRenderKey && canvasSource.value) return;
  lastRenderKey = currentKey;

  loading.value = true;
  canvasSource.value = null;
  resolvedPreviewLayerNames.value = null;

  try {
    const baseCassette = await loadCassette();
    const cassette = await loadPreferredGeometryCassette(baseCassette);
    if (!cassette) return;

    if (cassette.data?.geometry?.dxfId) {
      setDxfSource(cassette.data.geometry.dxfId, cassetteMapping(cassette));
      return;
    }

    if (
      cassette.data?.geometry?.preview ||
      cassette.data?.geometry?.data ||
      cassette.data?.geometry?.points ||
      cassette.data?.layerData?.length ||
      cassette.data?.polygonParts?.length ||
      cassette.data?.geometry?.data?.layerData?.length ||
      cassette.data?.geometry?.data?.polygonParts?.length
    ) {
      setGeometrySource(cassette);
      return;
    }

    const type = cassetteType(cassette);
    const definition = cassetteDefinition(cassette);
    if (isOccsCassetteDefinition(definition)) {
      setOccsSource(definition);
      return;
    }

    const graph = cassetteGraph(cassette);
    if (type === 'PARAMETRIC' || graph.extrusions.length > 0 || Object.keys(graph.params).length > 0) {
      setParametricSource(graph);
      return;
    }

    if (!props.preferGeometry && type === 'STANDARD') {
      const design = await $fetch(`/api/cassette-designs/by-template/${cassette._id}`).catch(() => null);
      if (design?.data?.geometry?.dxfId) {
        setDxfSource(design.data.geometry.dxfId, cassetteMapping(cassette));
      }
    }
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  if (!container.value) return;

  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      isVisible.value = true;
      updateThumbnail();
      observer.disconnect();
    }
  }, { threshold: 0.1 });

  observer.observe(container.value);
});

watch(() => [props.cassetteId, props.cassette, props.dimensions], () => {
  if (isVisible.value) updateThumbnail();
}, { deep: true });
</script>
