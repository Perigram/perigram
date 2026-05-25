<template>
  <div ref="container" class="h-full w-full">
    <DrawingCanvas
      v-if="canvasSource"
      :source="canvasSource"
      :source-type="canvasSourceType"
      :layer-mapping="canvasLayerMapping"
      mode="thumbnail"
    />
    <div v-else class="flex aspect-[5/3] h-full w-full items-center justify-center rounded-ui border border-content-border bg-subtle text-muted-color">
      <i :class="loading ? 'pi pi-spin pi-spinner' : 'pi pi-image'" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
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

const cassetteType = (cassette) => cassette?.data?.type || '';
const cassetteDefinition = (cassette) => cassette?.data?.definition || {};
const cassetteMapping = (cassette) => cassetteDefinition(cassette)?.mapping || {};
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

const updateThumbnail = async () => {
  if (!isVisible.value) return;

  const currentKey = JSON.stringify([props.cassetteId, props.cassette?._id, props.cassette?.updatedAt, props.dimensions]);
  if (currentKey === lastRenderKey && canvasSource.value) return;
  lastRenderKey = currentKey;

  loading.value = true;
  canvasSource.value = null;

  try {
    const cassette = await loadCassette();
    if (!cassette) return;

    if (cassette.data?.geometry?.dxfId) {
      setDxfSource(cassette.data.geometry.dxfId, cassetteMapping(cassette));
      return;
    }

    const type = cassetteType(cassette);
    const graph = cassetteGraph(cassette);
    if (type === 'PARAMETRIC' || graph.extrusions.length > 0 || Object.keys(graph.params).length > 0) {
      setParametricSource(graph);
      return;
    }

    if (type === 'STANDARD') {
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
