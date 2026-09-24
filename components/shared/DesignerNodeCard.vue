<template>
  <div :class="frameClass">
    <slot />
  </div>
</template>

<script setup>
// The one designer node-card frame. Every canvas card (process nodes and
// the declaration family on both the process and the type canvas) composes
// this frame, so card proportions and selection chrome stay one
// vocabulary instead of five hand-rolled frameClass copies. The card
// surface is deliberately chrome: concern lives in the icon and label,
// never in card color.
import { computed } from 'vue';

const props = defineProps({
  selected: { type: Boolean, default: false },
  // sm (declaration leaves) | md (type/class cards) | lg (operation cards)
  size: { type: String, default: 'md' }
});

const WIDTHS = { sm: 'w-48', md: 'w-56', lg: 'w-72' };

const frameClass = computed(() => [
  'relative rounded-ui border bg-content p-2.5 pt-3 shadow-card transition-colors',
  WIDTHS[props.size] || WIDTHS.md,
  props.selected ? 'border-primary' : 'border-content-border'
]);
</script>
