<template>
  <FilePayloadViewer
    v-if="payloadPreview.hasPayload && payloadPreview.renderable"
    :source="viewerSource"
    :variant="'card'"
    class="h-32 w-full"
  />
  <GeometryPreview
    v-else-if="declaredPreview"
    :source="declaredPreview"
    :hide-dimension-layer="hideDimensionLayer"
    :fill="fill"
  />
</template>

<script setup>
import { computed } from 'vue';
import FilePayloadViewer from '~/components/shared/FilePayloadViewer.vue';
import GeometryPreview from '~/components/shared/GeometryPreview.vue';
import { resolveFilePreview } from '~/components/generated/file-preview-contract.js';
import { previewSourceValue } from '~/utils/instance-shape.js';
import { useFileTypeView } from '~/composables/useFileTypeView.js';

// The generic instance preview media (the fallback every preview slot
// renders when no plugin preview mounts): a file instance with a stored
// payload previews through the type's declared preview policy, and a
// declared previewSource value renders through the shared drawing canvas
// — the authored preview channel never depends on an uploaded payload.
const props = defineProps({
  entity: { type: Object, required: true },
  typeId: { type: String, required: true },
  hideDimensionLayer: { type: Boolean, default: false },
  // Host-owned band opt-in: renderers fill the fixed-height band with no
  // chrome of their own.
  fill: { type: Boolean, default: false }
});

const { typeById } = useFileTypeView();
const payloadPreview = computed(() => resolveFilePreview(props.entity, typeById(props.typeId)));
const viewerSource = computed(() => ({
  mode: payloadPreview.value.mode,
  fileUrl: payloadPreview.value.fileUrl,
  attachment: props.entity.payload
}));
const declaredPreview = computed(() => {
  const type = typeById(props.typeId);
  if (type?.previewSource?.display !== 'geometry') return null;
  const value = props.entity?.previewSource ?? previewSourceValue(props.entity, type);
  return value ? { data: { geometry: value } } : null;
});
</script>
