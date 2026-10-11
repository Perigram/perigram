<template>
  <RemoteInstancePreview
    v-if="pluginPreview"
    :record="instance"
    :type-id="typeId"
    :preview="pluginPreview"
  >
    <div class="h-28 w-full" :class="[LAYOUT.row, 'text-supporting text-muted']">
      <i :class="typeGlyph" />
    </div>
  </RemoteInstancePreview>
  <ArtifactViewer
    v-else-if="hasRenderablePayload"
    :source="{ mode: preview.mode, fileUrl, attachment: payload }"
    :variant="'card'"
    class="h-28 w-full"
  />
  <DrawingCanvas
    v-else-if="hasDeclaredPreviewSource"
    :source="{ data: { geometry: previewSource } }"
    source-type="geometry-preview"
    mode="card"
    class="h-28 w-full"
  />
  <div v-else-if="preview.component === 'ImagePreview'" class="w-full">
    <svg viewBox="0 0 240 96" width="100%" class="h-28 w-full" preserveAspectRatio="xMidYMid slice" role="img">
      <defs>
        <linearGradient :id="gradientId" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" :stop-color="accent" stop-opacity="0.5" />
          <stop offset="1" :stop-color="accentAlt" stop-opacity="0.3" />
        </linearGradient>
      </defs>
      <rect width="240" height="96" fill="var(--ck-subtle-background)" />
      <rect width="240" height="96" :fill="`url(#${gradientId})`" />
      <circle v-for="star in stars" :key="star.key" :cx="star.x" :cy="star.y" :r="star.r" :fill="star.fill" opacity="0.9" />
      <path :d="ridgePath" fill="var(--p-text-color)" opacity="0.12" />
    </svg>
  </div>
  <div v-else-if="preview.component === 'GeometryPreview'" class="w-full">
    <svg viewBox="0 0 240 96" width="100%" class="h-28 w-full" role="img">
      <rect width="240" height="96" fill="var(--ck-subtle-background)" />
      <circle cx="120" cy="48" r="38" :stroke="accent" stroke-dasharray="3 4" stroke-width="1.5" fill="none" opacity="0.7" />
      <polygon :points="starPoints" :stroke="accent" stroke-width="1.5" fill="none" opacity="0.9" />
      <circle v-for="node in starNodes" :key="node.key" :cx="node.x" :cy="node.y" r="2" :fill="accent" />
    </svg>
  </div>
  <div v-else-if="preview.component && payload" :class="[LAYOUT.row, 'h-28 w-full rounded-ui bg-subtle text-supporting text-muted']">
    <i class="pi pi-file" />
    <span>{{ sizeLabel }}</span>
  </div>
  <!-- A payload-less instance has no file facts to state: the band stays
       quiet with the type's own glyph — no MIME strings, no invented
       content (blank is the honest surface for a record that never
       saved a source). -->
  <div v-else-if="preview.component" :class="[LAYOUT.row, 'h-28 w-full text-supporting text-muted']" :aria-hidden="true">
    <i :class="typeGlyph" />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { LAYOUT, RENDERABLE_PREVIEW_MODES, resolvePreview } from '#shared/ui-mapping/index.js';
import ArtifactViewer from '~/components/artifacts/ArtifactViewer.vue';
import DrawingCanvas from '~/components/shared/DrawingCanvas.vue';
import RemoteInstancePreview from '~/components/generated/RemoteInstancePreview.vue';
import { resolvePluginPreview } from '~/components/generated/plugin-preview-bindings.js';

const props = defineProps({
  type: { type: Object, default: null },
  payload: { type: Object, default: null },
  // The screen instance (flat fields, payload reference, previewSource):
  // present wherever the host holds the record — the plugin preview
  // mounts over it read-only.
  instance: { type: Object, default: null },
  // Declared preview value (the type's authored previewSource field, read
  // off the wire DTO): renders when no payload exists, so declared
  // previews never depend on an uploaded payload. The canvas normalizer
  // accepts the stored shapes (layer/polygon part lists, pre-built
  // drawings).
  previewSource: { type: null, default: null },
  seed: { type: String, default: '' }
});

const preview = computed(() => resolvePreview(props.type || {}));
const typeId = computed(() => String(props.type?.id || ''));
const pluginPreview = computed(() => (props.instance ? resolvePluginPreview(typeId.value) : null));
const hasDeclaredPreviewSource = computed(() => Boolean(
  props.type?.previewSource?.display === 'geometry' && props.previewSource
));
// Real payload preview (unified contract): an instance payload reference
// with a renderable declared mode renders through the shared viewer; the
// placeholder art stays for payload-less instances.
const hasRenderablePayload = computed(() => Boolean(
  props.payload?.fileId
  && RENDERABLE_PREVIEW_MODES.includes(preview.value.mode)
));
const fileUrl = computed(() => (props.payload?.fileId
  ? `/api/files/download/${encodeURIComponent(String(props.payload.fileId))}?bucket=files`
  : ''));
const mime = computed(() => props.payload?.mime || preview.value.mime[0] || preview.value.mode);
// The quiet blank band's glyph: the type's authored depiction, falling
// back to the generic file icon — the type's own mark, never a MIME.
const typeGlyph = computed(() => props.type?.depiction?.glyph || 'pi pi-file');
const sizeLabel = computed(() => (props.payload?.size
  ? `${(props.payload.size / 1024).toFixed(0)} KB · ${mime.value}`
  : mime.value));

const hashCode = computed(() => Array.from(props.seed || props.payload?.fileId || mime.value || 'x')
  .reduce((acc, character) => ((acc * 31) + character.charCodeAt(0)) >>> 0, 7));
const hue = computed(() => hashCode.value % 360);
const accent = computed(() => `hsl(${hue.value} 62% 52% / 0.55)`);
const accentAlt = computed(() => `hsl(${(hashCode.value >>> 4) % 360} 55% 55% / 0.4)`);
const gradientId = computed(() => `preview-gradient-${hashCode.value % 100000}`);

const stars = computed(() => Array.from({ length: 7 }, (_, index) => ({
  key: index,
  x: 16 + ((hashCode.value >>> (index + 2)) % 208),
  y: 12 + ((hashCode.value >>> (index + 5)) % 52),
  r: 1 + ((hashCode.value >>> index) % 3),
  fill: `hsl(${(hue.value + 40 * index) % 360} 70% 80% / ${(0.5 + ((hashCode.value >>> index) % 4) / 10).toFixed(2)})`
})));

const ridgePath = computed(() => {
  const a = 58 + (hue.value % 12);
  const b = 60 + ((hashCode.value >>> 6) % 14);
  return `M0 78 Q 40 ${a} 80 74 T 160 ${b} T 240 72 L 240 96 L 0 96 Z`;
});

const starNodes = computed(() => {
  const count = 8;
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2 + (hashCode.value % 10) / 14;
    const radius = index % 2 === 0 ? 30 : 13 + ((hashCode.value >>> index) % 8);
    return {
      key: index,
      x: 120 + radius * Math.cos(angle),
      y: 48 + radius * Math.sin(angle)
    };
  });
});
const starPoints = computed(() => starNodes.value.map(node => `${node.x.toFixed(1)},${node.y.toFixed(1)}`).join(' '));
</script>
