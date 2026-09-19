<template>
  <div v-if="preview.component === 'ImagePreview'" class="flex w-full flex-col gap-1">
    <Image :src="imageDataUri" :alt="mime" class="w-full rounded-ui" />
    <span class="text-supporting text-muted">{{ mime }}</span>
  </div>
  <div v-else-if="preview.component === 'GeometryPreview'" class="flex w-full flex-col gap-1">
    <img :src="geometryDataUri" :alt="mime" class="w-full rounded-ui" >
    <span class="text-supporting text-muted">{{ mime }}</span>
  </div>
  <div v-else-if="preview.component" class="flex h-24 w-full flex-col items-center justify-center gap-1 rounded-ui bg-subtle">
    <i :class="placeholderIcon" class="text-muted" />
    <span class="text-supporting">{{ sizeLabel }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import Image from 'primevue/image';
import { resolvePreview } from '#shared/ui-mapping/index.js';

const props = defineProps({
  type: { type: Object, default: null },
  payload: { type: Object, default: null },
  seed: { type: String, default: '' }
});

const preview = computed(() => resolvePreview(props.type || {}));
const mime = computed(() => props.payload?.mime || preview.value.mime[0] || preview.value.mode);
const placeholderIcon = computed(() => 'pi pi-file');
const sizeLabel = computed(() => (props.payload?.size
  ? `${(props.payload.size / 1024).toFixed(0)} KB · ${mime.value}`
  : mime.value));

const hashCode = computed(() => Array.from(props.seed || props.payload?.fileId || mime.value || 'x')
  .reduce((acc, character) => ((acc * 31) + character.charCodeAt(0)) >>> 0, 7));
const hue = computed(() => hashCode.value % 360);

const imageDataUri = computed(() => {
  const h = hue.value;
  const alt = (hashCode.value >> 4) % 360;
  const stars = Array.from({ length: 6 }, (_, index) => {
    const x = 20 + ((hashCode.value >> (index + 2)) % 200);
    const y = 15 + ((hashCode.value >> (index + 5)) % 60);
    const r = 1 + ((hashCode.value >> index) % 3);
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="hsl(${alt}, 60%, 85%)" opacity="0.9"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="96">`
    + `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">`
    + `<stop offset="0" stop-color="hsl(${h}, 65%, 22%)"/><stop offset="1" stop-color="hsl(${alt}, 55%, 38%)"/>`
    + `</linearGradient></defs>`
    + `<rect width="240" height="96" rx="8" fill="url(#g)"/>${stars}`
    + `<path d="M0 78 Q 40 ${58 + (h % 12)} 80 74 T 160 ${60 + (alt % 14)} T 240 72 L 240 96 L 0 96 Z" fill="hsl(${h}, 45%, 12%)" opacity="0.75"/>`
    + `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
});

const geometryDataUri = computed(() => {
  const points = Array.from({ length: 9 }, (_, index) => {
    const angle = (index / 8) * Math.PI * 2 + (hashCode.value % 10) / 14;
    const radius = index % 2 === 0 ? 34 : 14 + ((hashCode.value >> index) % 10);
    return `${(120 + radius * Math.cos(angle)).toFixed(1)},${(48 + radius * Math.sin(angle)).toFixed(1)}`;
  }).join(' ');
  const h = hue.value;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="96">`
    + `<rect width="240" height="96" rx="8" fill="hsl(${h}, 25%, 92%)"/>`
    + `<polyline points="${points}" fill="none" stroke="hsl(${h}, 60%, 38%)" stroke-width="2"/>`
    + `<circle cx="120" cy="48" r="2.5" fill="hsl(${h}, 60%, 30%)"/>`
    + `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
});
</script>
