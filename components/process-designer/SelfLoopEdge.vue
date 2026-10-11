<template>
  <BaseEdge :id="id" :path="path" :style="style" />
</template>

<script setup>
// The self-referencing children wire — a class declaring recursive
// containment (SPEC §6) wires its own type output back into its declare
// input. The default bezier degenerates there into a line through the
// card, so a wire whose source and target are the same node renders as
// one hoop over it. Geometry is chrome (process-designer README, "Node UI
// contract"): the loop adds no channel — cargo stays on the line style
// decorateEdge owns, direction on the left/right handle canon.
import { computed } from 'vue';
import { BaseEdge } from '@vue-flow/core';

const props = defineProps({
  id: { type: String, default: '' },
  sourceX: { type: Number, required: true },
  sourceY: { type: Number, required: true },
  targetX: { type: Number, required: true },
  targetY: { type: Number, required: true },
  style: { type: Object, default: undefined }
});

const path = computed(() => {
  const width = Math.max(props.sourceX - props.targetX, 40);
  const rise = Math.min(Math.max(width * 0.4, 48), 96);
  const reach = Math.min(Math.max(width * 0.35, 36), 90);
  const apexX = (props.sourceX + props.targetX) / 2;
  const apexY = Math.min(props.sourceY, props.targetY) - rise;
  return [
    `M ${props.sourceX},${props.sourceY}`,
    `C ${props.sourceX + reach},${props.sourceY} ${apexX + reach * 0.55},${apexY} ${apexX},${apexY}`,
    `C ${apexX - reach * 0.55},${apexY} ${props.targetX - reach},${props.targetY} ${props.targetX},${props.targetY}`
  ].join(' ');
});
</script>
