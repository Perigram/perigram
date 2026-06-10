<script setup>
import DrawingCanvas from '~/components/shared/DrawingCanvas.vue';

defineProps({
  entity: { type: Object, required: true }
});
</script>

<template>
  <div data-entity-card-interactive="true" @click.stop>
    <DrawingCanvas
      :source="entity"
      source-type="geometry-preview"
      mode="card"
    />
  </div>
</template>
