<script setup>
import { computed } from 'vue';

const props = defineProps({
  entity: { type: Object, required: true }
});

const geometry = computed(() => props.entity.data?.geometry || {});
const preview = computed(() => geometry.value.preview || geometry.value.data || {});
const viewBox = computed(() => preview.value.viewBox || '0 0 100 60');
const layers = computed(() => Array.isArray(preview.value.layers) ? preview.value.layers : []);
const polygon = computed(() => {
  if (Array.isArray(preview.value.points)) return preview.value.points;
  if (Array.isArray(geometry.value.points)) return geometry.value.points;
  return [];
});
const hasPreview = computed(() => layers.value.length > 0 || polygon.value.length > 0);
const polygonPoints = computed(() => polygon.value.map(point => point.join(',')).join(' '));
</script>

<template>
  <div class="aspect-[5/3] w-full overflow-hidden rounded-ui border border-content-border bg-subtle">
    <svg v-if="hasPreview" class="h-full w-full" :viewBox="viewBox" xmlns="http://www.w3.org/2000/svg">
      <g v-if="layers.length" fill="none">
        <g v-for="layer in layers" :key="layer.name" :stroke="layer.color || 'currentColor'" :stroke-width="layer.weight || 1">
          <path v-for="path in layer.paths" :key="path" :d="path" />
        </g>
      </g>
      <polygon v-else :points="polygonPoints" fill="none" stroke="currentColor" stroke-width="2" />
    </svg>
    <div v-else class="flex h-full items-center justify-center text-muted-color">
      <i class="pi pi-image" />
    </div>
  </div>
</template>
