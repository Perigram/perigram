<template>
  <div
    class="relative h-80 w-full touch-none select-none"
    :class="panning ? 'cursor-grabbing' : 'cursor-grab'"
    data-scene-2d
    @pointerdown="startPan"
    @pointermove="pan"
    @pointerup="endPan"
    @pointercancel="endPan"
    @wheel.prevent="zoomBy"
    @dblclick="reset"
  >
    <svg
      :viewBox="viewBox"
      preserveAspectRatio="xMidYMid meet"
      class="h-full w-full"
      role="img"
      :aria-label="alt"
    >
      <g v-for="(primitive, index) in value.primitives" :key="index" fill="none" stroke="currentColor" stroke-width="1.5">
        <line v-if="primitive.type === 'line'" :x1="primitive.x1" :y1="primitive.y1" :x2="primitive.x2" :y2="primitive.y2" />
        <polyline v-else-if="primitive.type === 'polyline'" :points="svgPoints(primitive.points)" />
        <polygon v-else-if="primitive.type === 'polygon'" :points="svgPoints(primitive.points)" />
        <circle v-else-if="primitive.type === 'circle'" :cx="primitive.cx" :cy="primitive.cy" :r="primitive.r" />
        <rect v-else-if="primitive.type === 'rect'" :x="primitive.x" :y="primitive.y" :width="primitive.width" :height="primitive.height" />
        <text v-else-if="primitive.type === 'text'" :x="primitive.x" :y="primitive.y" fill="currentColor" stroke="none">{{ primitive.text }}</text>
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
// The host's common interactive 2D scene canvas (SPEC §28.14): the
// standardized primitive scene pans on drag, zooms on wheel, and fits on
// the control or double-click.
import { computed, ref } from 'vue';

const props = defineProps({
  value: { type: Object, default: () => ({}) },
  alt: { type: String, default: '' }
});

const zoom = ref(1);
const panX = ref(0);
const panY = ref(0);
const panning = ref(false);
const baseBounds = computed(() => {
  const declared = props.value?.bounds;
  if (declared && Number.isFinite(Number(declared.width)) && Number.isFinite(Number(declared.height))) {
    return {
      x: Number(declared.x || 0),
      y: Number(declared.y || 0),
      width: Math.max(1, Number(declared.width)),
      height: Math.max(1, Number(declared.height))
    };
  }
  const points = [];
  for (const primitive of props.value?.primitives || []) {
    if (primitive.type === 'line') points.push([primitive.x1, primitive.y1], [primitive.x2, primitive.y2]);
    else if (primitive.type === 'polyline' || primitive.type === 'polygon') points.push(...(primitive.points || []));
    else if (primitive.type === 'circle') {
      points.push([Number(primitive.cx) - Number(primitive.r), Number(primitive.cy) - Number(primitive.r)]);
      points.push([Number(primitive.cx) + Number(primitive.r), Number(primitive.cy) + Number(primitive.r)]);
    } else if (primitive.type === 'rect') {
      points.push([primitive.x, primitive.y], [Number(primitive.x) + Number(primitive.width), Number(primitive.y) + Number(primitive.height)]);
    } else if (primitive.type === 'text') points.push([primitive.x, primitive.y]);
  }
  const valid = points.filter(point => point.every(value => Number.isFinite(Number(value))));
  if (!valid.length) return { x: 0, y: 0, width: 100, height: 100 };
  const xs = valid.map(([x]) => Number(x));
  const ys = valid.map(([, y]) => Number(y));
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(1, Math.max(...xs) - Math.min(...xs)),
    height: Math.max(1, Math.max(...ys) - Math.min(...ys))
  };
});
const viewBox = computed(() => {
  const bounds = baseBounds.value;
  const width = bounds.width / Math.max(0.01, zoom.value);
  const height = bounds.height / Math.max(0.01, zoom.value);
  return `${bounds.x + (bounds.width - width) / 2 - panX.value} ${bounds.y + (bounds.height - height) / 2 - panY.value} ${width} ${height}`;
});

let drag = null;
function startPan(event) {
  panning.value = true;
  drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  event.currentTarget?.setPointerCapture?.(event.pointerId);
}
function pan(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const scale = baseBounds.value.width / Math.max(1, event.currentTarget?.clientWidth || 800);
  panX.value += (event.clientX - drag.x) * scale;
  panY.value += (event.clientY - drag.y) * scale;
  drag = { ...drag, x: event.clientX, y: event.clientY };
}
function endPan(event) {
  if (drag && event?.pointerId === drag.pointerId) event.currentTarget?.releasePointerCapture?.(event.pointerId);
  drag = null;
  panning.value = false;
}
function zoomBy(event) {
  zoom.value = Math.min(8, Math.max(0.2, zoom.value * (event.deltaY > 0 ? 0.9 : 1.1)));
}
function reset() {
  zoom.value = 1;
  panX.value = 0;
  panY.value = 0;
}
function svgPoints(points = []) {
  return points.map(([x, y]) => `${x},${y}`).join(' ');
}
</script>
