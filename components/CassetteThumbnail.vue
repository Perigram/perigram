<template>
  <div
    ref="container"
    class="w-full"
    :class="{ 'aspect-square': fixedFrame }"
    data-instance-card-interactive="true"
    @click.stop
  >
    <DrawingCanvas
      v-if="canvasSource"
      :class="{ '!h-full !aspect-auto': fixedFrame }"
      :source="canvasSource"
      :source-type="canvasSourceType"
      :layer-mapping="canvasLayerMapping"
      :visible-layer-names="previewVisibleLayerNames"
      mode="thumbnail"
      @ready="handleDrawingReady"
    />
    <div
      v-else
      class="flex w-full items-center justify-center rounded-ui border border-content-border bg-subtle text-muted"
      :class="fixedFrame ? 'h-full' : 'aspect-[5/3]'"
    >
      <i :class="loading ? 'pi pi-spin pi-spinner' : 'pi pi-image'" />
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, watch } from 'vue';
import DrawingCanvas from '~/components/shared/DrawingCanvas.vue';
import { instancePayloadFileUrl } from '~/components/generated/file-preview-contract.js';

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
  },
  hideDimensionLayer: {
    type: Boolean,
    default: false
  },
  fixedFrame: {
    type: Boolean,
    default: false
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

const isOccsCassetteDefinition = (definition) => Boolean(definition?.occs && definition?.documentType);const hasRenderableGeometry = (cassette) => Boolean(
  cassette?.data?.layerData?.length ||
  cassette?.data?.polygonParts?.length
);
const hasBakedPreviewGeometry = (cassette) => hasRenderableGeometry(cassette);

const loadCassette = async () => {
  if (props.cassette) return props.cassette;
  const cid = props.cassetteId?.toString();
  if (!cid) return null;
  return await $fetch(`/api/instances/cassette/${cid}`).catch(() => null);
};

// The OCCS document rides the payload (§3): fetch and parse it. Returns
// null for payload-less or non-JSON payloads — geometry fields render
// those.
const cassettePayloadDefinition = async (cassette) => {
  const url = instancePayloadFileUrl(cassette?.attachments?.primary);
  if (!url) return null;
  try {
    const definition = await $fetch(url, { responseType: 'text' }).then(JSON.parse);
    return isOccsCassetteDefinition(definition) ? definition : null;
  } catch {
    return null;
  }
};

const setGeometrySource = (cassette) => {
  canvasSource.value = props.preferGeometry
    ? { ...cassette, __perigramPreferLayerData: true }
    : cassette;
  canvasSourceType.value = 'geometry-preview';
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
  const previewPriority = props.hideDimensionLayer
    ? PREVIEW_LAYER_PRIORITY.filter(name => name !== 'dimension.cassette')
    : PREVIEW_LAYER_PRIORITY;
  const allowed = previewPriority.filter(name => layerNames.includes(name));
  resolvedPreviewLayerNames.value = allowed.length ? allowed : null;
};

const loadPreferredGeometryCassette = async (cassette) => cassette;

const updateThumbnail = async () => {
  if (!isVisible.value) return;

  const currentKey = JSON.stringify([
    props.cassetteId,
    props.cassette?._id,
    props.cassette?.updatedAt,
    props.cassette?.attachments?.primary?.fileId,
    props.cassette?.data?.layerData?.length,
    props.cassette?.data?.polygonParts?.length,
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

    if (hasBakedPreviewGeometry(cassette)) {
      setGeometrySource(cassette);
      return;
    }

    // No stored geometry: the record is its payload document — preview
    // from it whenever it parses as an OCCS definition.
    const definition = await cassettePayloadDefinition(cassette);
    if (definition) {
      setOccsSource(definition);
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
