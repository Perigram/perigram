<template>
  <div class="pointer-events-none absolute inset-0 -z-10 overflow-visible" aria-hidden="true">
    <div
      v-for="(band, bandIndex) in bands"
      :key="band.id"
      class="absolute left-0 border-t"
      :class="[
        bandIndex % 2 === 0 ? 'bg-subtle' : '',
        band.kind === 'declaration' ? 'border-chrome-border' : 'border-content-border'
      ]"
      :style="{ top: `${band.top}px`, height: `${band.height}px`, width: `${width}px` }"
    >
      <span v-if="band.label" class="absolute left-3 top-1.5 text-supporting text-muted">{{ band.label }}</span>
    </div>
    <div
      v-for="corridor in corridors"
      :key="`corridor:${corridor.id}`"
      class="absolute bg-primary-surface"
      :style="{ left: `${corridor.x}px`, width: `${corridor.width}px`, top: `${corridor.top}px`, height: `${corridor.height}px` }"
    />
  </div>
</template>

<script setup>
// Lane bands for the process canvas (canonical contract:
// components/process-designer README, "Lanes"). Rendered through Vue
// Flow's zoom-pane slot at a negative z-index: a TRUE BACKGROUND layer
// beneath edges and nodes (their computed z-indexes start at 0), never
// covering them. Pure projection — the page derives bands and corridors
// from grant records; this component only paints.
defineProps({
  bands: { type: Array, default: () => [] },
  corridors: { type: Array, default: () => [] },
  width: { type: Number, default: 0 }
});
</script>
