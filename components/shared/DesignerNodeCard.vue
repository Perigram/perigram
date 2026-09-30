<template>
  <div :class="frameClass">
    <span
      v-if="signal"
      class="absolute inset-y-0 left-0 w-1"
      :class="signalBgClass(signal)"
      aria-hidden="true"
    ></span>
    <slot />
  </div>
</template>

<script setup>
// The one designer node-card frame (canonical contract:
// components/process-designer README, "Node UI contract"). `primary`
// marks the operation population: those cards carry the primary-tinted
// surface; every other card keeps the plain content surface. The border
// is chrome; selection is its single state. `signal` is the shared
// category accent (utils/processDesignerSignals.js): the same token
// colors the palette chip that creates the node.
import { computed } from 'vue';
import { signalBgClass } from '~/utils/processDesignerSignals.js';

const props = defineProps({
  selected: { type: Boolean, default: false },
  // sm (declaration leaves) | md (type/class cards) | lg (operation cards)
  size: { type: String, default: 'md' },
  primary: { type: Boolean, default: false },
  signal: { type: String, default: '' }
});

const WIDTHS = { sm: 'w-48', md: 'w-56', lg: 'w-72' };

const frameClass = computed(() => [
  'relative rounded-ui border p-2.5 pt-3 shadow-card transition-colors',
  WIDTHS[props.size] || WIDTHS.md,
  props.primary ? 'bg-primary-surface' : 'bg-content',
  props.selected ? 'border-primary' : 'border-content-border'
]);
</script>
