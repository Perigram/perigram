<template>
  <img
    v-if="view === 'image' && imageUrl"
    :src="imageUrl"
    :alt="alt"
    class="max-h-[32rem] max-w-full object-contain"
  >
  <svg
    v-else-if="view === 'scene-2d' && scene2dReady"
    :viewBox="scene2dViewBox"
    class="h-80 w-full"
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
  <svg
    v-else-if="view === 'scene-3d' && scene3dReady"
    viewBox="0 0 800 500"
    class="h-80 w-full"
    role="img"
    :aria-label="alt"
  >
    <polygon v-for="(face, index) in scene3d.faces" :key="`f${index}`" :points="face" fill="currentColor" fill-opacity="0.08" stroke="currentColor" stroke-opacity="0.35" />
    <line v-for="(edge, index) in scene3d.edges" :key="`e${index}`" :x1="edge.x1" :y1="edge.y1" :x2="edge.x2" :y2="edge.y2" stroke="currentColor" stroke-width="1.5" />
  </svg>
  <pre v-else-if="view === 'text' && typeof value === 'string'" class="whitespace-pre-wrap break-words text-supporting">{{ value }}</pre>
  <div v-else-if="view === 'markdown' && typeof value === 'string'" class="whitespace-pre-wrap break-words text-supporting">{{ value }}</div>
  <div v-else-if="view === 'table' && tableReady" class="overflow-x-auto">
    <table class="w-full text-supporting">
      <thead><tr><th v-for="column in tableColumns" :key="column" class="p-2 text-left">{{ column }}</th></tr></thead>
      <tbody>
        <tr v-for="(row, index) in value" :key="index">
          <td v-for="column in tableColumns" :key="column" class="border-t border-surface p-2">{{ format(row?.[column]) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
  <a
    v-else-if="view === 'document' && value?.fileId"
    class="text-supporting underline"
    :href="`/api/files/download/${encodeURIComponent(value.fileId)}?bucket=${encodeURIComponent(value.bucket || 'files')}`"
    target="_blank"
    rel="noopener"
  >{{ value.name || alt }}</a>
  <pre v-else class="whitespace-pre-wrap break-all text-supporting">{{ jsonText(value) }}</pre>
</template>

<script setup>
// The one graph-output value renderer (SPEC §28.14): a value renders
// through its best supported view (`utils/graphOutputViews.js` owns the
// order) with raw JSON as the explicit fallback. Every preview surface
// — the graph editor's output panel and the outputs channel — renders
// values through this component.
import { computed } from 'vue';
import { graphOutputViews, graphOutputTableColumns } from '~/utils/graphOutputViews.js';

const props = defineProps({
  value: { type: null, default: null },
  // 'best' follows the representation contract's order.
  view: { type: String, default: 'best' },
  alt: { type: String, default: '' }
});

const supportedViews = computed(() => graphOutputViews(props.value));
const view = computed(() => (props.view === 'best'
  ? supportedViews.value[0]?.value || 'json'
  : props.view));

const imageUrl = computed(() => {
  const value = props.value;
  return value?.fileId && String(value.mime || '').startsWith('image/')
    ? `/api/files/download/${encodeURIComponent(value.fileId)}?bucket=${encodeURIComponent(value.bucket || 'files')}`
    : '';
});
const scene2dReady = computed(() => Array.isArray(props.value?.primitives) && props.value.primitives.length > 0);
const scene2dViewBox = computed(() => {
  const bounds = props.value?.bounds || { x: 0, y: 0, width: 100, height: 100 };
  return `${Number(bounds.x || 0)} ${Number(bounds.y || 0)} ${Math.max(1, Number(bounds.width || 100))} ${Math.max(1, Number(bounds.height || 100))}`;
});
const scene3dReady = computed(() => Array.isArray(props.value?.vertices) && props.value.vertices.length > 0);
const scene3d = computed(() => {
  const vertices = Array.isArray(props.value?.vertices) ? props.value.vertices : [];
  if (!vertices.length) return { faces: [], edges: [] };
  const projected = vertices.map(vertex => {
    const [x = 0, y = 0, z = 0] = (Array.isArray(vertex) ? vertex : []).map(Number);
    return { x: (x - y) * 0.8660254, y: (x + y) * 0.5 - z };
  });
  const xs = projected.map(point => point.x), ys = projected.map(point => point.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = Math.min(720 / Math.max(1, maxX - minX), 420 / Math.max(1, maxY - minY));
  const points = projected.map(point => ({ x: 400 + (point.x - (minX + maxX) / 2) * scale, y: 250 - (point.y - (minY + maxY) / 2) * scale }));
  const faces = (props.value.faces || []).filter(face => Array.isArray(face) && face.length >= 3 && face.every(index => Number.isInteger(index) && points[index])).map(face => face.map(index => `${points[index].x},${points[index].y}`).join(' '));
  const edgePairs = Array.isArray(props.value.edges) && props.value.edges.length
    ? props.value.edges
    : (props.value.faces || []).flatMap(face => face.map((index, position) => [index, face[(position + 1) % face.length]]));
  const edges = edgePairs.filter(edge => Array.isArray(edge) && edge.length === 2 && points[edge[0]] && points[edge[1]]).map(([a, b]) => ({ x1: points[a].x, y1: points[a].y, x2: points[b].x, y2: points[b].y }));
  return { faces, edges };
});
const tableReady = computed(() => Array.isArray(props.value)
  && props.value.length > 0
  && props.value.every(item => item && typeof item === 'object' && !Array.isArray(item)));
const tableColumns = computed(() => graphOutputTableColumns(props.value));

function svgPoints(points = []) {
  return points.map(([x, y]) => `${x},${y}`).join(' ');
}

function format(value) {
  return value === undefined || value === null || typeof value !== 'object' ? String(value) : JSON.stringify(value, null, 2);
}

function jsonText(value) {
  return JSON.stringify(value === undefined ? null : value, null, 2);
}
</script>
