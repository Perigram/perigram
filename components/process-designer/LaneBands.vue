<template>
  <div class="pointer-events-none absolute inset-0 -z-10 overflow-visible" aria-hidden="true">
    <div
      v-for="band in bands"
      :key="band.id"
      class="absolute"
      :style="{ top: `${band.top}px`, left: `${left}px`, width: `${Math.max(0, right - left)}px`, borderTop: '1px solid var(--p-content-border-color)' }"
    >
      <span
        v-if="band.label"
        class="absolute left-3 top-1.5 text-label text-muted"
        :style="labelStyle"
      >{{ band.label }}</span>
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
import { computed } from 'vue';
import { useVueFlow } from '@vue-flow/core';

// Lane bands for the process canvas (canonical contract:
// components/process-designer README, "Lanes"): hairline separators
// spanning the nodes' horizontal domain, rendered through Vue Flow's
// zoom-pane slot at a negative z-index — a background layer beneath
// edges and nodes. Lane titles are the org's own role names at label
// size, counter-scaled by the canvas zoom (absolute screen size). Pure
// projection — the page derives bands and corridors from grant records;
// this component only paints. It reads the viewport itself so the page
// never tracks the per-frame viewport ref.
const props = defineProps({
  bands: { type: Array, default: () => [] },
  corridors: { type: Array, default: () => [] },
  left: { type: Number, default: 0 },
  right: { type: Number, default: 0 }
});

const { viewport } = useVueFlow();

const labelStyle = computed(() => ({
  transform: `scale(${1 / (viewport.value?.zoom || 1)})`,
  transformOrigin: 'left top'
}));
</script>
