<template>
  <div class="pointer-events-none absolute inset-0 -z-10 overflow-visible" aria-hidden="true">
    <div
      v-for="band in bands"
      :key="band.id"
      class="absolute border-t border-content-border"
      :style="{ top: `${band.top}px`, left: `${left}px`, width: `${Math.max(0, right - left)}px` }"
    />
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
// components/process-designer README, "Lanes"): untitled hairline
// separators spanning the nodes' horizontal domain, rendered through Vue
// Flow's zoom-pane slot at a negative z-index — a background layer
// beneath edges and nodes that never covers them. Pure projection — the
// page derives bands and corridors from grant records; this component
// only paints.
defineProps({
  bands: { type: Array, default: () => [] },
  corridors: { type: Array, default: () => [] },
  left: { type: Number, default: 0 },
  right: { type: Number, default: 0 }
});
</script>
