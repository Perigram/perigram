<script setup>
import { computed, ref } from 'vue';
import DrawingCanvas from '~/components/shared/DrawingCanvas.vue';

const props = defineProps({
  // The resolved drawing value (a pre-built { viewBox, layers } drawing,
  // or a raw geometry/layer-data value the canvas normalizer accepts).
  source: { type: [Object, Array], default: null },
  hideDimensionLayer: { type: Boolean, default: false },
  // Host-owned band opt-in (DrawingCanvas `fill`): the canvas paints no
  // own chrome and fills the fixed-height band.
  fill: { type: Boolean, default: false }
});

const visibleLayerNames = ref(null);
const previewVisibleLayerNames = computed(() => props.hideDimensionLayer ? visibleLayerNames.value : null);

function handleDrawingReady(drawing) {
  if (!props.hideDimensionLayer) {
    visibleLayerNames.value = null;
    return;
  }
  const layerNames = Array.isArray(drawing?.layers)
    ? drawing.layers.map(layer => layer.name).filter(Boolean)
    : [];
  const allowed = layerNames.filter(isProductionPreviewLayer);
  visibleLayerNames.value = allowed.length ? allowed : layerNames.filter(name => !isDimensionLayerName(name));
}

function isProductionPreviewLayer(name = '') {
  return /^(sheet|stock|cut|fold|bend|contour)(\.|$)/i.test(String(name));
}

function isDimensionLayerName(name = '') {
  return /^dimension(\.|$)/i.test(String(name));
}
</script>

<template>
  <div v-if="source" data-instance-card-interactive="true" @click.stop>
    <DrawingCanvas
      :source="source"
      source-type="geometry-preview"
      mode="card"
      :fill="fill"
      :visible-layer-names="previewVisibleLayerNames"
      @ready="handleDrawingReady"
    />
  </div>
</template>
