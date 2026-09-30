<template>
  <div :class="frameClass">
    <slot />
  </div>
</template>

<script setup>
// The one designer node-card frame (canonical contract:
// components/process-designer README, "Node UI contract"). `primary`
// marks the operation population: those cards carry the primary-tinted
// surface; every other card keeps the plain content surface. The border
// is chrome; selection is its single state. Operation cards (`lg`) size
// to their socket-name columns — content width with a floor and a cap
// (SPEC "Node layouts"): names crop at their column max, the title at
// the card cap, and the input/output columns keep the row's fixed gap.
import { computed } from 'vue';

const props = defineProps({
  selected: { type: Boolean, default: false },
  // sm (declaration leaves) | md (type/class cards) | lg (operation cards)
  size: { type: String, default: 'md' },
  primary: { type: Boolean, default: false }
});

const WIDTHS = {
  sm: 'w-48',
  md: 'w-56',
  lg: 'w-max min-w-72 max-w-96'
};

const frameClass = computed(() => [
  'relative rounded-ui border p-2.5 pt-3 shadow-card transition-colors',
  WIDTHS[props.size] || WIDTHS.md,
  props.primary ? 'bg-primary-surface' : 'bg-content',
  props.selected ? 'border-primary' : 'border-content-border'
]);
</script>
