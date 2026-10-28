<template>
  <RemoteInstancePreview
    v-if="pluginPreview"
    :record="instance"
    :type-id="typeId"
    :preview="pluginPreview"
  >
    <div :class="[bandClass, LAYOUT.row, 'text-supporting text-muted']">
      <i :class="typeGlyph" />
    </div>
  </RemoteInstancePreview>
  <FilePayloadViewer
    v-else-if="hasRenderablePayload"
    :source="{ mode: preview.mode, fileUrl, attachment: payload }"
    :variant="fill ? 'pane' : 'card'"
    :class="bandClass"
  />
  <DrawingCanvas
    v-else-if="hasDeclaredPreviewSource"
    :source="{ data: { geometry: previewSource } }"
    source-type="geometry-preview"
    mode="card"
    :class="bandClass"
  />
  <div v-else-if="preview.component && payload" :class="bandClass" class="flex items-center justify-center">
    <FileChip :file="payload" />
  </div>
  <!-- A payload-less instance has no file facts to state: the band stays
       quiet with the type's own glyph — no MIME strings, no invented
       content (blank is the honest surface for a record that never
       saved a source). -->
  <div v-else-if="preview.component" :class="[LAYOUT.row, bandClass, 'text-supporting text-muted']" :aria-hidden="true">
    <i :class="typeGlyph" />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { LAYOUT, RENDERABLE_PREVIEW_MODES, resolvePreview } from '#shared/ui-mapping/index.js';
import FilePayloadViewer from '~/components/shared/FilePayloadViewer.vue';
import FileChip from '~/components/shared/FileChip.vue';
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
  // Fill the host band instead of the fixed-height stamp: the record
  // body's stepped hero band (LAYOUT.previewHeroBand) sizes the slot.
  fill: { type: Boolean, default: false }
});

const bandClass = computed(() => (props.fill ? 'h-full w-full' : LAYOUT.previewBand));

const preview = computed(() => resolvePreview(props.type || {}));
const typeId = computed(() => String(props.type?.id || ''));
const pluginPreview = computed(() => (props.instance ? resolvePluginPreview(typeId.value) : null));
const hasDeclaredPreviewSource = computed(() => Boolean(
  props.type?.previewSource?.display === 'geometry' && props.previewSource
));
// Real payload preview (unified contract): an instance payload reference
// with a renderable declared mode renders through the shared viewer.
const hasRenderablePayload = computed(() => Boolean(
  props.payload?.fileId
  && RENDERABLE_PREVIEW_MODES.includes(preview.value.mode)
));
const fileUrl = computed(() => (props.payload?.fileId
  ? `/api/files/download/${encodeURIComponent(String(props.payload.fileId))}?bucket=files`
  : ''));
// The quiet blank band's glyph: the type's authored depiction, falling
// back to the generic file icon — the type's own mark, never a MIME.
const typeGlyph = computed(() => props.type?.depiction?.glyph || 'pi pi-file');

</script>
