<template>
  <div class="pointer-events-none absolute inset-0 overflow-visible" aria-hidden="true">
    <div
      v-for="(band, index) in bands"
      :key="band.id"
      class="absolute left-0 border-t"
      :class="[
        index % 2 === 0 ? 'bg-subtle' : '',
        band.kind === 'declaration' ? 'border-chrome-border' : 'border-content-border'
      ]"
      :style="{ top: `${band.top}px`, height: `${band.height}px`, width: `${width}px` }"
    >
      <span v-if="band.label" class="absolute left-3 top-1.5 text-supporting text-muted">{{ band.label }}</span>
    </div>
  </div>
</template>

<script setup>
// Lane bands for the process canvas (canonical contract:
// components/process-designer README, "Lanes (view)"). Rendered through
// Vue Flow's zoom-pane slot so the strips live in flow coordinates and
// transform with the viewport. Bands are pure projection — the page
// derives them from grant records (never stored); this component only
// paints tops/heights/labels and owns no lane logic.
defineProps({
  bands: { type: Array, default: () => [] },
  width: { type: Number, default: 0 }
});
</script>
