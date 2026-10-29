<template>
  <!-- The app's one file chip: `name · size` states the facts, a
       deliberate hover raises the payload peek (SPEC §22.14), and the
       click stays the consumer's open behavior. -->
  <HoverPeek :enabled="Boolean(peek)">
    <template #default="{ peekEvents }">
      <Chip
        v-on="peekEvents"
        :label="label"
        :icon="icon"
        :pt="CHIP_LABEL_PT"
        :class="[FILE_CHIP_CLASS, { 'cursor-pointer': openable }]"
        :title="title"
        :role="openable ? 'button' : undefined"
        :tabindex="openable ? 0 : undefined"
        data-testid="file-chip"
        @click="emit('open')"
        @keydown.enter.prevent="emit('open')"
      />
    </template>
    <template v-if="peek" #preview>
      <span class="instance-preview-slot block h-40 w-full overflow-hidden rounded-ui border border-content-border bg-subtle">
        <FilePayloadViewer :source="peek" variant="card" />
      </span>
      <span class="flex min-w-0 flex-col gap-0.5">
        <span class="min-w-0 truncate text-label" :title="label">{{ label }}</span>
        <span v-if="metaLine" class="text-muted text-supporting">{{ metaLine }}</span>
      </span>
    </template>
  </HoverPeek>
</template>

<script setup>
import { computed } from 'vue';
import Chip from 'primevue/chip';
import HoverPeek from '~/components/shared/HoverPeek.vue';
import FilePayloadViewer from '~/components/shared/FilePayloadViewer.vue';
import { resolveAttachmentPeek } from '~/components/generated/file-preview-contract.js';
import { CHIP_LABEL_PT, FILE_CHIP_CLASS } from './chip-surface.js';

const props = defineProps({
  // The stored file reference in either wire shape: generator blobs
  // (`{ fileId, mime, name, size }`) and chat attachments
  // (`{ fileId, mimeType, name, size }`).
  file: { type: Object, default: null }
});
const emit = defineEmits(['open']);

const mime = computed(() => String(props.file?.mime || props.file?.mimeType || ''));
const name = computed(() => String(props.file?.name || '').trim());
const label = computed(() => name.value || mime.value || '—');
const openable = computed(() => Boolean(props.file?.fileId));
const peek = computed(() => resolveAttachmentPeek(props.file || {}));
const size = computed(() => {
  const bytes = Number(props.file?.size) || 0;
  if (bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
});
const metaLine = computed(() => [mime.value, size.value].filter(Boolean).join(' · '));
const title = computed(() => {
  const parts = [label.value, size.value].filter(Boolean);
  return parts.join(' · ');
});
const icon = computed(() => {
  const value = mime.value;
  if (value.includes('pdf')) return 'pi pi-file-pdf';
  if (value.includes('sheet') || value.includes('excel')) return 'pi pi-file-excel';
  if (value.includes('word')) return 'pi pi-file-word';
  return 'pi pi-file';
});
</script>
