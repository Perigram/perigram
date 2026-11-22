<template>
  <div
    class="relative h-80 w-full touch-none select-none"
    :class="panning ? 'cursor-grabbing' : 'cursor-grab'"
    data-scene-3d
    @pointerdown="startDrag"
    @pointermove="drag"
    @pointerup="endDrag"
    @pointercancel="endDrag"
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
      <g>
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
      </g>
    </svg>
    <button
      type="button"
      class="absolute right-2 top-2 rounded-ui bg-subtle p-1 text-muted"
      :aria-label="$t('processDesigner.frameAll')"
      :title="$t('processDesigner.frameAll')"
      @click.stop="reset"
    >
      <i class="pi pi-expand" aria-hidden="true" />
    </button>
  </div>
</template>

<script setup>
// The host's common interactive scene viewer (SPEC §28.14): orbit on
// drag, pan on shift/middle drag, zoom on wheel, and fit on the control
// or double-click. Projection math lives in utils/scene3d.js.
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { projectScene3d } from '~/utils/scene3d.js';

const WIDTH = 800;
const HEIGHT = 500;
const DEFAULT_YAW = -Math.PI / 6;
const DEFAULT_PITCH = Math.PI / 6;

const props = defineProps({
  value: { type: Object, default: () => ({}) },
  alt: { type: String, default: '' }
});

const { t } = useI18n();
const yaw = ref(DEFAULT_YAW);
const pitch = ref(DEFAULT_PITCH);
const zoom = ref(1);
const panX = ref(0);
const panY = ref(0);
const panning = ref(false);
const projection = computed(() => projectScene3d(props.value, {
  yaw: yaw.value,
  pitch: pitch.value,
  zoom: zoom.value,
  panX: panX.value,
  panY: panY.value,
  width: WIDTH,
  height: HEIGHT
}));

let pointer = null;
function startDrag(event) {
  const pan = event.button === 1 || event.shiftKey || event.altKey;
  panning.value = pan;
  pointer = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, pan };
  event.currentTarget?.setPointerCapture?.(event.pointerId);
}
function drag(event) {
  if (!pointer || event.pointerId !== pointer.pointerId) return;
  const dx = event.clientX - pointer.x;
  const dy = event.clientY - pointer.y;
  if (pointer.pan) {
    panX.value += dx;
    panY.value += dy;
  } else {
    yaw.value += dx * 0.01;
    pitch.value = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, pitch.value + dy * 0.01));
  }
  pointer = { ...pointer, x: event.clientX, y: event.clientY };
}
function endDrag(event) {
  if (pointer && event?.pointerId === pointer.pointerId) event.currentTarget?.releasePointerCapture?.(event.pointerId);
  pointer = null;
  panning.value = false;
}
function zoomBy(event) {
  zoom.value = Math.min(4, Math.max(0.4, zoom.value * (event.deltaY > 0 ? 0.9 : 1.1)));
}
function reset() {
  yaw.value = DEFAULT_YAW;
  pitch.value = DEFAULT_PITCH;
  zoom.value = 1;
  panX.value = 0;
  panY.value = 0;
}
</script>
