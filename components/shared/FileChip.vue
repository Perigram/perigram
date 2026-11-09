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
        :pt="chipPt"
        :class="[chipClass, { 'cursor-pointer': openable }]"
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
      <span class="flex min-w-0 flex-col gap-1">
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
import { fileTypeIconClass } from '~/utils/file-refs.js';
import { CHIP_LABEL_PT, FILE_CHIP_CLASS, FILE_PROSE_CHIP_CLASS, PROSE_CHIP_LABEL_PT } from './chip-surface.js';

const props = defineProps({
  // The stored file reference in either wire shape: generator blobs
  // (`{ fileId, mime, name, size }`) and chat attachments
  // (`{ fileId, mimeType, name, size }`).
  file: { type: Object, default: null },
  prose: { type: Boolean, default: false }
});
const emit = defineEmits(['open']);

const chipClass = computed(() => (props.prose ? FILE_PROSE_CHIP_CLASS : FILE_CHIP_CLASS));
const chipPt = computed(() => (props.prose ? PROSE_CHIP_LABEL_PT : CHIP_LABEL_PT));

const mime = computed(() => String(props.file?.mime || props.file?.mimeType || ''));
const name = computed(() => String(props.file?.name || '').trim());
const label = computed(() => name.value || mime.value || '—');
const openable = computed(() => Boolean(props.file?.fileId || props.file?.url));
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
const icon = computed(() => fileTypeIconClass(mime.value, name.value));
</script>
