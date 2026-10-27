<template>
  <Chip
    :label="label"
    :icon="icon"
    :pt="chipPt"
    class="min-w-0 max-w-full border border-content-border bg-subtle text-supporting"
    :class="{ 'cursor-pointer': openable }"
    :title="title"
    :role="openable ? 'button' : undefined"
    :tabindex="openable ? 0 : undefined"
    data-testid="file-chip"
    @click="emit('open')"
    @keydown.enter.prevent="emit('open')"
  />
</template>

<script setup>
// The app's one file chip (SPEC §22.8): the chat recipe — the file's
// name, a mime-aware icon, the bordered subtle chip, `name · size` on
// hover. Consumers own the open behavior through the `open` event.
import { computed } from 'vue';
import Chip from 'primevue/chip';

const props = defineProps({
  // The stored file reference in either wire shape: generator blobs
  // (`{ fileId, mime, name, size }`) and chat attachments
  // (`{ fileId, mimeType, name, size }`).
  file: { type: Object, default: null }
});
const emit = defineEmits(['open']);

const chipPt = { label: { class: 'truncate' } };
const mime = computed(() => String(props.file?.mime || props.file?.mimeType || ''));
const name = computed(() => String(props.file?.name || '').trim());
const label = computed(() => name.value || mime.value || '—');
const openable = computed(() => Boolean(props.file?.fileId));
const size = computed(() => {
  const bytes = Number(props.file?.size) || 0;
  if (bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
});
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
