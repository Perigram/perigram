<template>
  <div v-if="preview.hasPayload" class="flex min-h-0 flex-col gap-2">
    <ArtifactViewer
      v-if="preview.renderable"
      :source="{ mode: preview.mode, fileUrl: preview.fileUrl, attachment: entity.attachments?.primary }"
      class="min-h-[24rem] flex-1"
    />
    <div v-else class="flex items-center justify-end">
      <Button
        icon="pi pi-download"
        :label="$t('common.download')"
        size="small"
        severity="secondary"
        outlined
        as="a"
        :href="preview.fileUrl"
        target="_blank"
        rel="noopener"
      />
    </div>
  </div>
</template>

<script setup>
// File payload preview: renders a file instance's payload through the
// shared viewer modules using the type's declared preview policy. Only
// the preview contract lives here; editor surfaces own their overloads.
import { computed } from 'vue';
import Button from 'primevue/button';
import ArtifactViewer from '~/components/artifacts/ArtifactViewer.vue';
import { resolveFilePreview } from '~/components/generated/file-surfaces.js';
import { useFileTypeView } from '~/composables/useFileTypeView.js';

const props = defineProps({
  entity: { type: Object, required: true },
  typeId: { type: String, required: true }
});

const { typeById } = useFileTypeView();
const preview = computed(() => resolveFilePreview(props.entity, typeById(props.typeId)));
</script>
