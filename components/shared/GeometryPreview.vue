<script setup>
import DrawingCanvas from '~/components/shared/DrawingCanvas.vue';

defineProps({
  entity: { type: Object, required: true }
});
</script>

<template>
  <DrawingCanvas
    :source="entity"
    source-type="geometry-preview"
    mode="card"
  />
</template>
