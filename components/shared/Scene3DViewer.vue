<template>
  <div
    class="relative h-80 w-full cursor-grab touch-none select-none active:cursor-grabbing"
    data-scene-3d
    @pointerdown="startOrbit"
    @pointermove="orbit"
    @pointerup="endOrbit"
    @pointercancel="endOrbit"
    @wheel.prevent="zoomBy"
    @dblclick="reset"
  >
    <svg
      :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
      preserveAspectRatio="xMidYMid meet"
      class="h-full w-full"
      role="img"
      :aria-label="alt"
    >
      <polygon
        v-for="(face, index) in projection.faces"
        :key="`f${index}`"
        :points="face"
        fill="currentColor"
        fill-opacity="0.08"
        stroke="currentColor"
        stroke-opacity="0.35"
      />
      <line
        v-for="(edge, index) in projection.edges"
        :key="`e${index}`"
        :x1="edge.x1"
        :y1="edge.y1"
        :x2="edge.x2"
        :y2="edge.y2"
        stroke="currentColor"
        stroke-width="1.5"
      />
    </svg>
  </div>
</template>

<script setup>
// The host's interactive scene viewer (SPEC §28.14): a 3D graph output
// orbits on pointer drag and zooms on wheel; double-click restores the
// default view. Projection math lives in utils/scene3d.js.
import { computed, ref } from 'vue';
import { projectScene3d } from '~/utils/scene3d.js';

const WIDTH = 800;
const HEIGHT = 500;
const DEFAULT_YAW = -Math.PI / 6;
const DEFAULT_PITCH = Math.PI / 6;

const props = defineProps({
  value: { type: Object, default: () => ({}) },
  alt: { type: String, default: '' }
});

const yaw = ref(DEFAULT_YAW);
const pitch = ref(DEFAULT_PITCH);
const zoom = ref(1);
const projection = computed(() => projectScene3d(props.value, {
  yaw: yaw.value,
  pitch: pitch.value,
  zoom: zoom.value,
  width: WIDTH,
  height: HEIGHT
}));

let drag = null;
function startOrbit(event) {
  drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  event.currentTarget?.setPointerCapture?.(event.pointerId);
}
function orbit(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  yaw.value += (event.clientX - drag.x) * 0.01;
  pitch.value = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, pitch.value + (event.clientY - drag.y) * 0.01));
  drag = { ...drag, x: event.clientX, y: event.clientY };
}
function endOrbit(event) {
  if (drag && event?.pointerId === drag.pointerId) event.currentTarget?.releasePointerCapture?.(event.pointerId);
  drag = null;
}
function zoomBy(event) {
  zoom.value = Math.min(4, Math.max(0.4, zoom.value * (event.deltaY > 0 ? 0.9 : 1.1)));
}
function reset() {
  yaw.value = DEFAULT_YAW;
  pitch.value = DEFAULT_PITCH;
  zoom.value = 1;
}
</script>
