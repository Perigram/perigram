<template>
  <div :class="frameClass">
    <slot />
    <!-- The noun population's folded corner (BPMN data object): the
         top-right corner painted over with the canvas tone along a crisp
         diagonal — the dog-ear reads at any zoom while the card's own
         border and shadow stay untouched. Inline SVG, not scoped CSS:
         the design system keeps one global style vocabulary. -->
    <svg v-if="shape === 'data'" class="pointer-events-none absolute right-0 top-0 h-3.5 w-3.5" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M14 0 L14 14 L0 0 Z" fill="var(--ck-process-canvas-background)" />
      <path d="M14 14 L0 0" stroke="var(--p-content-border-color)" stroke-width="1" />
    </svg>
  </div>
</template>

<script setup>
// The one designer node-card frame. Every canvas card (process nodes and
// the declaration family on both the process and the type canvas) composes
// this frame, so card proportions and selection chrome stay one
// vocabulary instead of five hand-rolled frameClass copies. The card
// surface is deliberately chrome: concern lives in the icon and label,
// never in card color. SHAPE encodes the BPMN population (canonical
// contract: components/process-designer README, "Node UI contract"):
// 'task' = verb (sharp-corner rectangle), 'data' = noun (folded-corner
// data object), 'declaration' = vocabulary (dashed frame in the
// declaration-wire tone); no shape = the neutral default frame, kept by
// the control species until the control-species fate decision (the
// reserved gateway slot).
import { computed } from 'vue';

const props = defineProps({
  selected: { type: Boolean, default: false },
  // sm (declaration leaves) | md (type/class cards) | lg (operation cards)
  size: { type: String, default: 'md' },
  // task | data | declaration | '' (neutral default)
  shape: { type: String, default: '' }
});

const WIDTHS = { sm: 'w-48', md: 'w-56', lg: 'w-72' };

const frameClass = computed(() => [
  'relative border bg-content p-2.5 pt-3 shadow-card transition-colors',
  WIDTHS[props.size] || WIDTHS.md,
  props.shape === 'task' ? 'rounded-none' : 'rounded-ui',
  props.shape === 'declaration' ? 'border-dashed' : '',
  props.selected
    ? 'border-primary'
    : props.shape === 'declaration' ? 'border-signal-structure-muted' : 'border-content-border'
]);
</script>
