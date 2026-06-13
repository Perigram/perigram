<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
  imageUrl: { type: String, default: '' },
  geometry: { type: Object, default: null },
  calibration: { type: Object, default: () => ({}) },
  prompt: { type: Object, default: () => ({}) },
  promptEditable: { type: Boolean, default: false },
  geometryEditable: { type: Boolean, default: false },
  selectedVertices: { type: Array, default: () => [] }
});

const emit = defineEmits(['update:prompt', 'vertex-click']);

const imageEl = ref(null);
const drawing = ref(false);
const draftPoints = ref([]);
const naturalSize = ref({ width: 0, height: 0 });

const canDraw = computed(() => props.promptEditable && props.imageUrl);
const outerPrompt = computed(() => props.prompt?.outer || []);
const scale = computed(() => props.calibration?.scale || {});
const pixelBounds = computed(() => scale.value.pixelBounds || {});

const geometryOuter = computed(() => {
  const ring = props.geometry?.polygon?.outer || [];
  return ring.slice(0, ring.length > 1 ? -1 : ring.length);
});

const promptPath = computed(() => pathFromNormalized(outerPrompt.value));
const draftPath = computed(() => pathFromNormalized(draftPoints.value));
const geometryPath = computed(() => {
  const points = geometryOuter.value.map(pointToImagePixel).filter(Boolean);
  return pathFromPixels(points, true);
});

function onImageLoad(event) {
  naturalSize.value = {
    width: event.target.naturalWidth || 0,
    height: event.target.naturalHeight || 0
  };
}

function handlePointerDown(event) {
  if (!canDraw.value) return;
  drawing.value = true;
  draftPoints.value = [eventPoint(event)];
  event.currentTarget.setPointerCapture?.(event.pointerId);
}

function handlePointerMove(event) {
  if (!drawing.value) return;
  draftPoints.value = [...draftPoints.value, eventPoint(event)];
}

function handlePointerUp(event) {
  if (!drawing.value) return;
  drawing.value = false;
  if (draftPoints.value.length >= 3) {
    emit('update:prompt', { outer: simplifyNormalizedRing(draftPoints.value), holes: [] });
  }
  draftPoints.value = [];
}

function handleVertexClick(index) {
  if (!props.geometryEditable) return;
  emit('vertex-click', { ring: 'outer', index });
}

function eventPoint(event) {
  const rect = imageEl.value?.getBoundingClientRect?.() || event.currentTarget.getBoundingClientRect();
  return [
    clamp((event.clientX - rect.left) / Math.max(rect.width, 1)),
    clamp((event.clientY - rect.top) / Math.max(rect.height, 1))
  ];
}

function pointToImagePixel(point) {
  const width = naturalSize.value.width;
  const height = naturalSize.value.height;
  const scaleX = Number(scale.value.scaleX || 0);
  const scaleY = Number(scale.value.scaleY || 0);
  const minX = Number(pixelBounds.value.min_x ?? pixelBounds.value.minX);
  const minY = Number(pixelBounds.value.min_y ?? pixelBounds.value.minY);
  if (!width || !height || !scaleX || !scaleY || !Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return [
    minX + Number(point[0]) / scaleX,
    minY + Number(point[1]) / scaleY
  ];
}

function isSelected(index) {
  return props.selectedVertices.some(item => item.ring === 'outer' && item.index === index);
}

function pathFromNormalized(points) {
  return pathFromPixels(points.map(([x, y]) => [
    x * naturalSize.value.width,
    y * naturalSize.value.height
  ]), true);
}

function pathFromPixels(points, closed = false) {
  if (!points.length) return '';
  const [first, ...rest] = points;
  return `M ${first[0]} ${first[1]} ${rest.map(point => `L ${point[0]} ${point[1]}`).join(' ')}${closed ? ' Z' : ''}`;
}

function simplifyNormalizedRing(points) {
  const step = Math.max(1, Math.floor(points.length / 64));
  const sampled = points.filter((_, index) => index % step === 0);
  const last = sampled[sampled.length - 1];
  return sampled.filter((point, index) => {
    if (index === 0) return true;
    const prev = sampled[index - 1];
    return Math.hypot(point[0] - prev[0], point[1] - prev[1]) > 0.004;
  }).filter((point, index, items) => {
    if (index !== items.length - 1 || !last) return true;
    return Math.hypot(point[0] - items[0][0], point[1] - items[0][1]) > 0.01;
  });
}

function clamp(value) {
  return Math.min(Math.max(Number(value) || 0, 0), 1);
}
</script>

<template>
  <div class="overflow-hidden rounded-ui border border-content-border bg-subtle">
    <div
      class="relative touch-none"
      :class="canDraw ? 'cursor-crosshair' : ''"
      @pointerdown="handlePointerDown"
      @pointermove="handlePointerMove"
      @pointerup="handlePointerUp"
      @pointercancel="handlePointerUp"
    >
      <img
        ref="imageEl"
        :src="imageUrl"
        class="block h-auto w-full select-none"
        draggable="false"
        @load="onImageLoad"
      />
      <svg
        v-if="naturalSize.width && naturalSize.height"
        class="pointer-events-none absolute inset-0 h-full w-full"
        :viewBox="`0 0 ${naturalSize.width} ${naturalSize.height}`"
        preserveAspectRatio="none"
      >
        <path
          v-if="promptPath"
          :d="promptPath"
          class="fill-primary stroke-primary opacity-40"
          stroke-width="4"
          vector-effect="non-scaling-stroke"
        />
        <path
          v-if="draftPath"
          :d="draftPath"
          class="fill-primary stroke-primary opacity-40"
          stroke-width="3"
          vector-effect="non-scaling-stroke"
        />
        <path
          v-if="geometryPath"
          :d="geometryPath"
          class="fill-transparent stroke-primary"
          stroke-width="3"
          vector-effect="non-scaling-stroke"
        />
        <g v-if="geometryEditable">
          <circle
            v-for="(point, index) in geometryOuter"
            :key="index"
            :cx="pointToImagePixel(point)?.[0]"
            :cy="pointToImagePixel(point)?.[1]"
            r="7"
            class="pointer-events-auto cursor-pointer stroke-primary"
            :class="isSelected(index) ? 'fill-primary' : 'fill-content'"
            stroke-width="2"
            vector-effect="non-scaling-stroke"
            @click.stop="handleVertexClick(index)"
          />
        </g>
      </svg>
    </div>
  </div>
</template>
