<script setup>
import { computed, ref } from 'vue';
import DrawingCanvas from '~/components/shared/DrawingCanvas.vue';

const props = defineProps({
  entity: { type: Object, required: true },
  hideDimensionLayer: { type: Boolean, default: false }
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
  return /^(sheet|stock|cut|fold|bend)(\.|$)/i.test(String(name));
}

function isDimensionLayerName(name = '') {
  return /^dimension(\.|$)/i.test(String(name));
}
</script>

<template>
  <div data-instance-card-interactive="true" @click.stop>
    <DrawingCanvas
      :source="entity"
      source-type="geometry-preview"
      mode="card"
      :visible-layer-names="previewVisibleLayerNames"
      @ready="handleDrawingReady"
    />
  </div>
</template>
