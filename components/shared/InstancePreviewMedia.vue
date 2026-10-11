<template>
  <ArtifactViewer
    v-if="payloadPreview.hasPayload && payloadPreview.renderable"
    :source="{ mode: payloadPreview.mode, fileUrl: payloadPreview.fileUrl, attachment: entity.payload }"
    :variant="'card'"
    class="h-32 w-full"
  />
  <GeometryPreview
    v-else-if="declaredPreview"
    :source="declaredPreview"
    :hide-dimension-layer="hideDimensionLayer"
  />
</template>

<script setup>
import { computed } from 'vue';
import ArtifactViewer from '~/components/artifacts/ArtifactViewer.vue';
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
  hideDimensionLayer: { type: Boolean, default: false }
});

const { typeById } = useFileTypeView();
const payloadPreview = computed(() => resolveFilePreview(props.entity, typeById(props.typeId)));
const declaredPreview = computed(() => {
  const type = typeById(props.typeId);
  if (type?.previewSource?.display !== 'geometry') return null;
  const value = props.entity?.previewSource ?? previewSourceValue(props.entity, type);
  return value ? { data: { geometry: value } } : null;
});
</script>
