<template>
  <svg :class="['h-4', 'w-full']" viewBox="0 0 120 16" preserveAspectRatio="none" aria-hidden="true">
    <line
      x1="2"
      y1="8"
      x2="118"
      y2="8"
      :stroke="stroke?.color || 'currentColor'"
      :stroke-width="strokeWidth"
      :stroke-dasharray="dashArray(stroke?.pattern, strokeWidth)"
      stroke-linecap="round"
      :opacity="stroke?.color ? 1 : 0.4"
    />
  </svg>
</template>

<script setup>
import { computed } from 'vue';
import { dashArray } from '~/utils/stroke-patterns.js';

// One-line stroke preview for pen templates (color, weight, pattern).
const props = defineProps({
  stroke: { type: Object, default: null }
});

const strokeWidth = computed(() => {
  const weight = Number(props.stroke?.weight);
  if (!Number.isFinite(weight) || weight <= 0) return 2;
  // mm → a visible px range: 0.1 mm ≈ 1 px, 1 mm ≈ 6 px, capped.
  return Math.min(8, Math.max(1, weight * 6));
});
</script>
