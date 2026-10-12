<template>
  <BaseEdge :id="id" :path="path" :style="style" />
</template>

<script setup>
// The self-referencing children wire — a class declaring recursive
// containment (SPEC §6) wires its own type output back into its declare
// input. Vue Flow's loopback example draws such a wire as one elliptical
// arc around the card (an SVG `A` command; the default bezier degenerates
// on a same-node wire into a line through the node). Geometry is chrome
// (process-designer README, "Node UI contract"): the loop adds no channel
// — cargo stays on the line style decorateEdge owns, direction on the
// left/right handle canon.
import { computed } from 'vue';
import { BaseEdge, Position, getBezierPath } from '@vue-flow/core';

const props = defineProps({
  id: { type: String, default: '' },
  sourceX: { type: Number, required: true },
  sourceY: { type: Number, required: true },
  targetX: { type: Number, required: true },
  targetY: { type: Number, required: true },
  sourcePosition: { type: String, default: null },
  targetPosition: { type: String, default: null },
  style: { type: Object, default: undefined }
});

const HORIZONTAL = [Position.Left, Position.Right];

const path = computed(() => {
  if (HORIZONTAL.includes(props.sourcePosition) && HORIZONTAL.includes(props.targetPosition)) {
    const radiusX = Math.abs(props.sourceX - props.targetX) * 0.6;
    const radiusY = 50;
    return `M ${props.sourceX} ${props.sourceY} A ${radiusX} ${radiusY} 0 1 0 ${props.targetX} ${props.targetY}`;
  }
  return getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    targetX: props.targetX,
    targetY: props.targetY,
    sourcePosition: props.sourcePosition ?? undefined,
    targetPosition: props.targetPosition ?? undefined
  })[0];
});
</script>
